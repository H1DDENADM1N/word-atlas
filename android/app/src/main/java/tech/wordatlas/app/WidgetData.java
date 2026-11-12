package tech.wordatlas.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * The one-way snapshot the web layer publishes for the home-screen widgets.
 *
 * <p>The launcher process cannot read a WebView's localStorage, and this app has
 * no service, no account and no network. The page therefore writes a small JSON
 * snapshot through {@code WordAtlasAndroid.publishWidgetSnapshot()}; the widget
 * only ever reads it. Nothing here writes back into learning progress.
 *
 * <p>One exception to "web only": the daily sentence can be recomputed from the
 * packaged atlas when the snapshot is from a previous day, so the quote still
 * changes at midnight even if the app has not been opened. That uses only
 * {@code assets/www/atlas/index.json} and one entries chunk — the same data the
 * page uses, with no duplication.
 */
final class WidgetData {

    private static final String TAG = "WordAtlasWidget";
    static final String PREF = "word-atlas-widget";
    static final String KEY_SNAPSHOT = "snapshot";
    static final long SLOT_MS = 2L * 60 * 60 * 1000;
    /** Twelve two-hour slots make a day, matching TOUGH_PER_DAY in the page. */
    static final int SLOTS_PER_DAY = 12;

    private WidgetData() {}

    static final class Card {
        String id = "";
        String word = "";
        /** Syllable-wrapped spelling for long headwords; empty means use `word`. */
        String wordBreak = "";
        String zh = "";
        String topic = "";
    }

    static final class Quote {
        String id = "";
        String word = "";
        String zh = "";
        String en = "";
        String enZh = "";
        String topic = "";
        String date = "";
        int enLen;
    }

    /** One hour-boundary projection of the 4x1 strip's four figures. */
    static final class Hour {
        long at;
        int remaining = -1;
        int due;
        int fresh;
        int minutes;
    }

    /** The four figures the progress strip draws at one instant. */
    static final class Plan {
        int remaining = -1;
        int due;
        int fresh;
        int minutes;
    }

    static final class Snapshot {
        boolean valid;
        String date = "";
        /**
         * Still published by the page, but no longer read: the cards follow the
         * system's own light/dark mode through resource qualifiers.
         */
        String theme = "dark";
        String seedDate = "";
        final List<Card> cards = new ArrayList<>();
        Quote sentence;
        int remaining = -1;
        int due = 0;
        int fresh = 0;
        int minutes = 0;
        /** Published by the page; empty on a snapshot from an older build. */
        final List<Hour> hours = new ArrayList<>();
    }

    /** Local calendar day, matching the page's {@code dayKey()}. */
    static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    static Snapshot read(Context ctx) {
        Snapshot s = new Snapshot();
        SharedPreferences prefs = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_SNAPSHOT, null);
        if (raw == null) return s;
        try {
            JSONObject o = new JSONObject(raw);
            s.valid = true;
            s.date = o.optString("date", "");
            s.theme = o.optString("theme", "dark");
            JSONObject tough = o.optJSONObject("tough");
            if (tough != null) {
                s.seedDate = tough.optString("seedDate", "");
                JSONArray cards = tough.optJSONArray("cards");
                if (cards != null) {
                    for (int i = 0; i < cards.length(); i++) {
                        JSONObject c = cards.optJSONObject(i);
                        if (c == null) continue;
                        Card card = new Card();
                        card.id = c.optString("id", "");
                        card.word = c.optString("word", "");
                        card.wordBreak = c.optString("wordBreak", "");
                        card.zh = c.optString("zh", "");
                        card.topic = c.optString("topic", "");
                        if (!card.id.isEmpty()) s.cards.add(card);
                    }
                }
            }
            JSONObject q = o.optJSONObject("sentence");
            if (q != null) {
                Quote quote = new Quote();
                quote.id = q.optString("id", "");
                quote.en = q.optString("en", "");
                quote.enZh = q.optString("zh", "");
                quote.topic = q.optString("topic", "");
                quote.date = q.optString("date", s.date);
                quote.enLen = q.optInt("enLen", quote.en.length());
                s.sentence = quote;
            }
            JSONObject plan = o.optJSONObject("plan");
            if (plan != null) {
                s.remaining = plan.optInt("remaining", -1);
                s.due = plan.optInt("due", 0);
                s.fresh = plan.optInt("fresh", 0);
                s.minutes = plan.optInt("minutes", 0);
            }
            // The page owns FSRS state; it projects the plan onto the next 25
            // hour boundaries so a closed app can still show cards coming due.
            JSONArray hours = o.optJSONArray("hours");
            if (hours != null) {
                for (int i = 0; i < hours.length(); i++) {
                    JSONObject h = hours.optJSONObject(i);
                    if (h == null) continue;
                    long at = h.optLong("at", 0);
                    if (at <= 0) continue;
                    Hour hour = new Hour();
                    hour.at = at;
                    hour.remaining = h.optInt("remaining", -1);
                    hour.due = h.optInt("due", 0);
                    hour.fresh = h.optInt("fresh", 0);
                    hour.minutes = h.optInt("minutes", 0);
                    s.hours.add(hour);
                }
            }
        } catch (JSONException e) {
            Log.w(TAG, "ignoring malformed widget snapshot", e);
            s.valid = false;
        }
        return s;
    }

    /**
     * Resolve the 4x1 figures for {@code now}: the last hourly projection at or
     * before this instant, or the published plan when there is no table at all.
     * This is a lookup only — no FSRS arithmetic is duplicated in Java. Once a
     * snapshot has fallen a whole day behind its table, prefer the plan that
     * was published with it over a projection that can no longer be trusted.
     */
    static Plan planAt(Snapshot s, long now) {
        Plan p = new Plan();
        p.remaining = s.remaining;
        p.due = s.due;
        p.fresh = s.fresh;
        p.minutes = s.minutes;
        Hour pick = null;
        for (Hour h : s.hours) {
            if (h.at <= now && (pick == null || h.at > pick.at)) pick = h;
        }
        if (pick == null || now - pick.at > 25L * 60 * 60 * 1000) return p;
        p.remaining = pick.remaining;
        p.due = pick.due;
        p.fresh = pick.fresh;
        p.minutes = pick.minutes;
        return p;
    }

    private static SharedPreferences widgetPrefs(Context ctx) {
        return ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE);
    }

    /** Manual "next word" offset, scoped to one widget instance and one day. */
    static int offset(Context ctx, int widgetId, String date) {
        return widgetPrefs(ctx).getInt("next:" + widgetId + ":" + date, 0);
    }

    static void advance(Context ctx, int widgetId) {
        SharedPreferences p = widgetPrefs(ctx);
        String key = "next:" + widgetId + ":" + today();
        p.edit().putInt(key, p.getInt(key, 0) + 1).apply();
    }

    /** Which of today's tough words is on screen right now. */
    static Card currentCard(Snapshot s, long now, int offset) {
        if (s.cards.isEmpty()) return null;
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        long slot = (now - cal.getTimeInMillis()) / SLOT_MS;
        int n = s.cards.size();
        // The page rotates the ranked pool by twelve words a day. If the app has
        // not been opened since, walk the same distance here — otherwise the
        // widget would replay the same first twelve every morning.
        long drift = (long) daysSince(s.seedDate) * SLOTS_PER_DAY;
        long index = ((slot + drift + offset) % n + n) % n;
        return s.cards.get((int) index);
    }

    /** Calendar days between a `yyyy-MM-dd` seed and today, clamped to sane. */
    private static int daysSince(String seedDate) {
        if (seedDate == null || seedDate.isEmpty()) return 0;
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            f.setLenient(false);
            Date seed = f.parse(seedDate);
            if (seed == null) return 0;
            Calendar from = Calendar.getInstance();
            from.setTime(seed);
            Calendar to = Calendar.getInstance();
            for (Calendar c : new Calendar[] {from, to}) {
                c.set(Calendar.HOUR_OF_DAY, 0);
                c.set(Calendar.MINUTE, 0);
                c.set(Calendar.SECOND, 0);
                c.set(Calendar.MILLISECOND, 0);
            }
            long days = Math.round((to.getTimeInMillis() - from.getTimeInMillis()) / 86_400_000.0);
            return (int) Math.max(0, Math.min(days, 3650));
        } catch (Exception e) {
            return 0;
        }
    }

    /** FNV-1a 32-bit, identical to {@code hashSeed()} in src/lib/text.ts. */
    static long fnv(String s) {
        int h = 0x811c9dc5;
        for (int i = 0; i < s.length(); i++) h = (h ^ s.charAt(i)) * 16777619;
        return h & 0xFFFFFFFFL;
    }

    /**
     * Recompute the "word of the day" and its IELTS-context example straight
     * from the packaged atlas. Used when the snapshot is stale or missing, and
     * cached per local date so the 670 KB index is parsed at most once a day.
     */
    static Quote fallbackQuote(Context ctx, String date) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        String cacheKey = "fallback:" + date;
        String cached = prefs.getString(cacheKey, null);
        if (cached != null) {
            try {
                return parseQuote(new JSONObject(cached));
            } catch (JSONException ignored) {
                prefs.edit().remove(cacheKey).apply();
            }
        }
        try {
            JSONObject idx = new JSONObject(readAsset(ctx, "www/atlas/index.json"));
            JSONArray words = idx.getJSONArray("words");
            JSONArray topics = idx.getJSONArray("topics");
            int chunk = idx.optInt("chunk", 100);
            List<Integer> pool = new ArrayList<>();
            for (int i = 0; i < words.length(); i++) {
                JSONArray row = words.getJSONArray(i);
                if (row.getInt(4) >= 2 && (row.getInt(6) & 1) != 0) pool.add(i);
            }
            if (pool.isEmpty()) return null;
            int pick = pool.get((int) (fnv(date) % pool.size()));
            JSONArray row = words.getJSONArray(pick);
            Quote q = new Quote();
            q.date = date;
            q.id = row.getString(0);
            q.word = row.getString(1);
            q.zh = row.getString(2);
            int topicIndex = row.getInt(5);
            q.topic = topicIndex >= 0 && topicIndex < topics.length() ? topics.getJSONArray(topicIndex).getString(0) : "nature";
            JSONArray entries = new JSONArray(readAsset(ctx, "www/atlas/entries/" + (pick / chunk) + ".json"));
            for (int i = 0; i < entries.length(); i++) {
                JSONObject e = entries.getJSONObject(i);
                if (!q.id.equals(e.optString("id"))) continue;
                JSONArray ex = e.optJSONArray("ex");
                if (ex != null && ex.length() > 1) {
                    JSONObject second = ex.getJSONObject(1);
                    q.en = second.optString("en", "");
                    q.enZh = second.optString("zh", "");
                }
                break;
            }
            if (q.en.isEmpty()) return null;
            q.enLen = q.en.length();
            prefs.edit().putString(cacheKey, toJson(q)).apply();
            return q;
        } catch (IOException | JSONException | OutOfMemoryError e) {
            Log.w(TAG, "fallback sentence unavailable", e);
            return null;
        }
    }

    private static Quote parseQuote(JSONObject o) {
        Quote q = new Quote();
        q.id = o.optString("id", "");
        q.word = o.optString("word", "");
        q.zh = o.optString("zh", "");
        q.en = o.optString("en", "");
        q.enZh = o.optString("enZh", "");
        q.topic = o.optString("topic", "");
        q.date = o.optString("date", "");
        q.enLen = o.optInt("enLen", q.en.length());
        return q;
    }

    private static String toJson(Quote q) throws JSONException {
        JSONObject o = new JSONObject();
        o.put("id", q.id);
        o.put("word", q.word);
        o.put("zh", q.zh);
        o.put("en", q.en);
        o.put("enZh", q.enZh);
        o.put("topic", q.topic);
        o.put("date", q.date);
        o.put("enLen", q.enLen);
        return o.toString();
    }

    private static String readAsset(Context ctx, String path) throws IOException {
        try (InputStream in = ctx.getAssets().open(path)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
