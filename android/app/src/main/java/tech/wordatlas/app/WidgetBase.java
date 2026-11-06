package tech.wordatlas.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Shared rendering for the three home-screen widgets.
 *
 * <p>Everything is RemoteViews: no service, no background polling, no network.
 * Updates arrive either from the system's 30-minute periodic broadcast, from
 * date/time broadcasts, or from the explicit refresh the web layer sends after
 * publishing a new snapshot.
 *
 * <p>Light/dark is not decided here. Every colour a widget draws comes from a
 * {@code @color/widget_*} resource with a values-night twin, so the launcher
 * re-inflates the card in whichever mode the system is in. Choosing colours in
 * Java would freeze them into the RemoteViews action list and a night-mode
 * switch would leave the card half-converted.
 */
public abstract class WidgetBase extends AppWidgetProvider {

    static final String ACTION_REFRESH = "tech.wordatlas.app.WIDGET_REFRESH";
    static final String ACTION_NEXT = "tech.wordatlas.app.WIDGET_NEXT";
    static final String EXTRA_ROUTE = "wa.route";
    static final String EXTRA_ACTION = "wa.action";
    static final String EXTRA_WIDGET_ID = "wa.widgetId";

    /** Called by {@code MainActivity.Bridge.publishWidgetSnapshot()}. */
    public static void publish(Context ctx, String json) {
        ctx.getSharedPreferences(WidgetData.PREF, Context.MODE_PRIVATE)
                .edit().putString(WidgetData.KEY_SNAPSHOT, json).apply();
        // Explicit (package-scoped) broadcast: all three receivers are static in
        // the manifest, so this works even with Android's implicit-broadcast limits.
        ctx.sendBroadcast(new Intent(ACTION_REFRESH).setPackage(ctx.getPackageName()));
    }

    protected abstract String kind();

    protected abstract int layout();

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        if (ACTION_NEXT.equals(action)) {
            int id = intent.getIntExtra(EXTRA_WIDGET_ID, -1);
            if (id >= 0) {
                WidgetData.advance(ctx, id);
                onUpdate(ctx, AppWidgetManager.getInstance(ctx), new int[] {id});
            }
            return;
        }
        if (ACTION_REFRESH.equals(action)
                || Intent.ACTION_DATE_CHANGED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                // Day/night switch: re-render so the bitmap slot is rebuilt too,
                // not only the colours the launcher already re-inflated.
                || Intent.ACTION_CONFIGURATION_CHANGED.equals(action)) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, getClass()));
            if (ids.length > 0) onUpdate(ctx, mgr, ids);
            return;
        }
        super.onReceive(ctx, intent);
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        WidgetData.Snapshot s = WidgetData.read(ctx);
        String today = WidgetData.today();
        // Cover the case where a widget is added before the app is ever opened.
        // A background FGS start may be refused; MainActivity retries on launch.
        WidgetKeepAlive.startIfNeeded(ctx);
        for (int id : ids) {
            RemoteViews views = new RemoteViews(ctx.getPackageName(), layout());
            if ("tough".equals(kind())) renderTough(ctx, views, id, s, today);
            else if ("quote".equals(kind())) renderQuote(ctx, views, id, s, today);
            else renderPlan(ctx, views, id, s);
            mgr.updateAppWidget(id, views);
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle options) {
        // One responsive layout per kind: every render re-reads the widget's
        // current width/height and re-fits the type to it.
        onUpdate(ctx, mgr, new int[] {id});
    }

    /* ------------------------------------------------------------------ */

    private void renderTough(Context ctx, RemoteViews v, int id, WidgetData.Snapshot s,
                             String today) {
        WidgetData.Card card = WidgetData.currentCard(s, System.currentTimeMillis(), WidgetData.offset(ctx, id, today));
        if (card == null) {
            // Empty tough pool / fresh install: fall back to today's word.
            WidgetData.Quote q = WidgetData.fallbackQuote(ctx, today);
            if (q != null) {
                card = new WidgetData.Card();
                card.id = q.id;
                card.word = q.word;
                card.wordBreak = q.word;
                card.zh = q.zh;
                card.topic = q.topic;
            }
        }
        if (card == null) {
            v.setViewVisibility(R.id.widget_bg, View.GONE);
            v.setTextViewText(R.id.widget_word, "Word Atlas");
            v.setTextViewText(R.id.widget_mean, "打开词光，开始今天的学习");
            v.setOnClickPendingIntent(R.id.widget_root, tap(ctx, id, 0, "#/", null));
            v.setOnClickPendingIntent(R.id.widget_next, next(ctx, id));
            return;
        }
        Bitmap art = WidgetArt.tough(ctx, Uri.encode(card.id));
        if (art == null && !card.topic.isEmpty()) {
            art = WidgetArt.topic(ctx, card.topic, 300, 480);
        }
        if (art != null) {
            v.setImageViewBitmap(R.id.widget_bg, art);
            v.setViewVisibility(R.id.widget_bg, View.VISIBLE);
        } else {
            v.setViewVisibility(R.id.widget_bg, View.GONE);
        }

        // The card may be shrunk to a single launcher cell (40dp floor), so the
        // gutters and the type scale with the reported width instead of assuming 2x2.
        int cardW = option(ctx, id, AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 130);
        int cardH = option(ctx, id, AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 150);
        boolean narrow = cardW < 150;
        int side = narrow ? 10 : 16;
        int bottom = narrow ? 14 : 18;
        v.setViewPadding(R.id.widget_body, dp(ctx, side), 0, dp(ctx, side), dp(ctx, bottom));

        String word = card.wordBreak == null || card.wordBreak.isEmpty() ? card.word : card.wordBreak;
        v.setTextViewText(R.id.widget_word, word);
        v.setTextViewText(R.id.widget_mean, card.zh);

        int textW = Math.max(48, cardW - side * 2);
        float zhSp = narrow ? 11f : 13f;
        v.setTextViewTextSize(R.id.widget_mean, TypedValue.COMPLEX_UNIT_SP, zhSp);
        int zhH = heightDpOf(ctx, card.zh, textW, zhSp, 2);
        // The wash under the copy is translucent, so the text no longer has to be
        // rationed to keep the art visible: the block may grow to the card and is
        // only kept clear of the refresh target in the top corner.
        int wordH = Math.max(24, cardH - (narrow ? 50 : 40) - bottom - zhH - 2);
        float base = card.word.length() > 10 ? 20f : 24f;
        float size = fitText(ctx, word, textW, wordH, 4, base, 9f, Typeface.SERIF);
        v.setTextViewTextSize(R.id.widget_word, TypedValue.COMPLEX_UNIT_SP, size);

        v.setOnClickPendingIntent(R.id.widget_root, tap(ctx, id, 0, "#/w/" + Uri.encode(card.id), null));
        v.setOnClickPendingIntent(R.id.widget_next, next(ctx, id));
    }

    private void renderQuote(Context ctx, RemoteViews v, int id, WidgetData.Snapshot s,
                             String today) {
        WidgetData.Quote q = s.sentence;
        if (q == null || q.en.isEmpty() || !today.equals(q.date)) {
            // The app has not been opened since midnight: recompute from the
            // packaged atlas so the sentence still changes on the new day.
            q = WidgetData.fallbackQuote(ctx, today);
        }
        if (q == null || q.en.isEmpty()) {
            v.setViewVisibility(R.id.widget_bg, View.GONE);
            v.setTextViewText(R.id.widget_en, "Word Atlas");
            v.setTextViewText(R.id.widget_zh, "打开词光，看看今天的一句话");
            v.setOnClickPendingIntent(R.id.widget_root, tap(ctx, id, 0, "#/", null));
            return;
        }
        // Same illustration as the in-app word card for this word, not a topic banner.
        Bitmap art = WidgetArt.quote(ctx, Uri.encode(q.id));
        if (art != null) {
            v.setImageViewBitmap(R.id.widget_bg, art);
            v.setViewVisibility(R.id.widget_bg, View.VISIBLE);
        } else {
            v.setViewVisibility(R.id.widget_bg, View.GONE);
        }
        v.setTextViewText(R.id.widget_en, q.en);
        v.setTextViewText(R.id.widget_zh, q.enZh);
        // RemoteViews cannot autosize, so measure here: the biggest size that
        // still lays out in five lines inside the card, never an ellipsis.
        int cardW = option(ctx, id, AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 276);
        int cardH = option(ctx, id, AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 220);
        int textW = Math.max(120, cardW - 28);                 // 14dp on each side
        int zhH = heightDpOf(ctx, q.enZh, textW, 13f, 3);
        // No percentage ceiling: the sentence gets the whole lower band (74% of
        // the card is what the design reserved for copy), because the plate is a
        // wash and the art still reads through it.
        int enH = Math.max(60, Math.round(cardH * 0.74f) - 14 - 6 - zhH);
        float size = fitText(ctx, q.en, textW, enH, 5, 22f, 12f);
        v.setTextViewTextSize(R.id.widget_en, TypedValue.COMPLEX_UNIT_SP, size);
        v.setOnClickPendingIntent(R.id.widget_root, tap(ctx, id, 0, "#/w/" + Uri.encode(q.id), null));
    }

    private void renderPlan(Context ctx, RemoteViews v, int id, WidgetData.Snapshot s) {
        String main = !s.valid ? "今日进度" : s.remaining > 0 ? "还剩 " + s.remaining + " 步" : "今天已点亮";
        String sub = !s.valid
                ? "待复习 — · 新词 —\n约 — 分钟"
                : "待复习 " + s.due + " · 新词 " + s.fresh + "\n约 " + s.minutes + " 分钟";
        v.setTextViewText(R.id.widget_plan_main, main);
        v.setTextViewText(R.id.widget_plan_sub, sub);

        // Down to three cells the full "继续旅程 →" capsule would eat a third of
        // the strip, so it drops to the two-character form and loses the arrow.
        int cardW = option(ctx, id, AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 276);
        boolean narrow = cardW < 220;
        if (narrow) {
            v.setTextViewText(R.id.widget_cta_text, "继续");
            v.setViewVisibility(R.id.widget_cta_icon, View.GONE);
        } else {
            v.setTextViewText(R.id.widget_cta_text, ctx.getString(R.string.widget_cta));
            v.setViewVisibility(R.id.widget_cta_icon, View.VISIBLE);
        }
        int ctaW = narrow ? 48 : 82;
        int textW = Math.max(96, cardW - 28 - 8 - ctaW);
        float mainSp = fitText(ctx, main, textW, 28, 1, 20f, 13f, Typeface.DEFAULT_BOLD);
        v.setTextViewTextSize(R.id.widget_plan_main, TypedValue.COMPLEX_UNIT_SP, mainSp);
        float size = fitText(ctx, sub, textW, 48, 2, 15f, 11f);
        v.setTextViewTextSize(R.id.widget_plan_sub, TypedValue.COMPLEX_UNIT_SP, size);
        v.setOnClickPendingIntent(R.id.widget_root, tap(ctx, id, 0, "#/", null));
        v.setOnClickPendingIntent(R.id.widget_cta, tap(ctx, id, 1, "#/learn", "start"));
    }

    /* ---- type fitting -------------------------------------------------- */

    private static int dp(Context ctx, float value) {
        return Math.round(value * ctx.getResources().getDisplayMetrics().density);
    }

    private static int option(Context ctx, int id, String key, int fallback) {
        Bundle o = AppWidgetManager.getInstance(ctx).getAppWidgetOptions(id);
        int value = o == null ? 0 : o.getInt(key, 0);
        return value > 0 ? value : fallback;
    }

    private static StaticLayout measure(Context ctx, CharSequence text, int widthDp, float sp,
                                        int maxLines, Typeface face) {
        DisplayMetrics dm = ctx.getResources().getDisplayMetrics();
        TextPaint paint = new TextPaint(TextPaint.ANTI_ALIAS_FLAG);
        paint.setTypeface(face);
        paint.setTextSize(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, dm));
        StaticLayout.Builder b = StaticLayout.Builder
                .obtain(text, 0, text.length(), paint, Math.max(1, Math.round(widthDp * dm.density)))
                .setIncludePad(false)
                .setLineSpacing(0f, 1f);
        if (maxLines > 0) b.setMaxLines(maxLines);
        return b.build();
    }

    static float fitText(Context ctx, CharSequence text, int widthDp, int heightDp, int maxLines,
                         float maxSp, float minSp) {
        return fitText(ctx, text, widthDp, heightDp, maxLines, maxSp, minSp, Typeface.SANS_SERIF);
    }

    /**
     * Largest sp at which {@code text} still fits the box without truncation.
     * Walks down in half-point steps from {@code maxSp}.
     */
    static float fitText(Context ctx, CharSequence text, int widthDp, int heightDp, int maxLines,
                         float maxSp, float minSp, Typeface face) {
        if (text == null || text.length() == 0) return maxSp;
        DisplayMetrics dm = ctx.getResources().getDisplayMetrics();
        float heightPx = heightDp * dm.density;
        for (float sp = maxSp; sp >= minSp; sp -= 0.5f) {
            StaticLayout l = measure(ctx, text, widthDp, sp, 0, face);
            if (l.getLineCount() <= maxLines && l.getHeight() <= heightPx) return sp;
        }
        return minSp;
    }

    static int heightDpOf(Context ctx, CharSequence text, int widthDp, float sp, int maxLines) {
        if (text == null || text.length() == 0) return 0;
        return Math.round(measure(ctx, text, widthDp, sp, maxLines, Typeface.SANS_SERIF).getHeight()
                / ctx.getResources().getDisplayMetrics().density);
    }

    /**
     * A distinct request code per widget and per tap target; otherwise
     * FLAG_UPDATE_CURRENT would let one widget overwrite another's route extra.
     *
     * <p>An activity PendingIntent, not a broadcast: a force-stop cancels every
     * PendingIntent the package created, and the launcher then has nothing to
     * send. For an activity it still falls back to starting the app itself (so
     * the tap opens the app); for a broadcast it does nothing at all, which
     * leaves the widget dead. See {@code MainActivity.isLauncherFallback()} for
     * what happens to the route in that case.
     */
    private static PendingIntent tap(Context ctx, int widgetId, int slot, String route, String action) {
        Intent intent = new Intent(ctx, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra(EXTRA_ROUTE, route);
        if (action != null) intent.putExtra(EXTRA_ACTION, action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(ctx, widgetId * 10 + slot, intent, flags);
    }

    /** The tough-word card's refresh button advances one slot in today's queue. */
    private static PendingIntent next(Context ctx, int widgetId) {
        // The refresh must work with no app process running. Some OEMs drop a
        // plain background broadcast instead of cold-starting its receiver, so
        // ask the system to include stopped packages and treat this as a
        // foreground-priority broadcast.
        Intent intent = new Intent(ctx, WidgetTough.class)
                .setAction(ACTION_NEXT)
                .addFlags(Intent.FLAG_INCLUDE_STOPPED_PACKAGES | Intent.FLAG_RECEIVER_FOREGROUND)
                .putExtra(EXTRA_WIDGET_ID, widgetId);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(ctx, widgetId * 10 + 2, intent, flags);
    }
}
