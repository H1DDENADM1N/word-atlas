package tech.wordatlas.app;

import android.app.Service;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.IBinder;
import android.util.Log;

/**
 * Keeps the home-screen widgets clickable when the app is swiped out of recents.
 *
 * <p>On ColorOS, swiping a task away is a package-level force-stop: it sets the
 * stopped flag and cancels <em>every</em> PendingIntent the package created —
 * including the three widgets' click targets and the tough card's refresh
 * target. The launcher then falls back to starting the app's plain MAIN intent,
 * which carries no route, so all four taps stop doing what they say.
 *
 * <p>A running (plain, non-foreground) service changes that one decision.
 * Measured on Android 16 / ColorOS 16: with this service alive, swiping the
 * task away leaves {@code stopped=false} and all PendingIntent records intact;
 * the process may still be reclaimed, but that alone does not cancel them. The
 * next tap therefore carries its own {@code wa.route} again, and the refresh
 * broadcast reaches {@link WidgetTough} without opening the app.
 *
 * <p>This is deliberately <em>not</em> a foreground service: verified on the
 * same device that a plain service is enough, which keeps the app at zero
 * declared permissions, zero notifications and zero background UI. Started only
 * while at least one of our widgets is on the home screen; {@code START_STICKY}
 * lets the system bring it back after a reclaim. The launcher fallback in
 * {@code MainActivity.isLauncherFallback()} remains as a safety net for a real
 * force-stop (Settings → 强行停止), which no service can prevent.
 */
public final class WidgetKeepAlive extends Service {

    private static final String TAG = "WordAtlasWidget";

    /** Best-effort: started from the app and from every widget re-render. */
    static void startIfNeeded(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        boolean any = mgr.getAppWidgetIds(new ComponentName(ctx, WidgetPlan.class)).length > 0
                || mgr.getAppWidgetIds(new ComponentName(ctx, WidgetQuote.class)).length > 0
                || mgr.getAppWidgetIds(new ComponentName(ctx, WidgetTough.class)).length > 0;
        if (!any) return;
        try {
            ctx.startService(new Intent(ctx, WidgetKeepAlive.class));
        } catch (RuntimeException e) {
            // A background start can be refused; the next app launch retries.
            Log.i(TAG, "keep-alive deferred: " + e.getMessage());
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
