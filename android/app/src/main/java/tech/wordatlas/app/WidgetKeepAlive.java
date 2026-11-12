package tech.wordatlas.app;

import android.app.Service;
import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

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
 * <p>Since v1.1.1 this service also drives the hourly refresh. On every local
 * hour boundary it asks the live WebView to re-publish its snapshot and then
 * broadcasts {@link WidgetBase#ACTION_REFRESH} so all three cards re-render.
 * The 4x1 strip resolves its four figures against the hour-by-hour plan table
 * in that snapshot, so "还剩 / 待复习 / 新词 / 约 x 分钟" follow cards coming
 * due even when nobody has opened the app — the launcher never has to run FSRS.
 *
 * <p>The schedule is a main-thread {@link Handler} aligned to the next hour,
 * not an exact alarm: no permission, no notification, no background UI. Clock
 * jumps, a screen wake after Doze and the system's own 30-minute widget updates
 * all re-align it, and the last pulled hour is persisted so a service restarted
 * by {@code START_STICKY} can catch up. A missed tick can therefore be late on
 * an aggressive ROM, but the next wake or widget update always corrects it.
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
    private static final String KEY_LAST_HOUR = "hourly:last";

    private final Handler handler = new Handler(Looper.getMainLooper());
    /** Local hour boundary of the last pull; -1 until the first alignment. */
    private long lastHour = -1;
    private BroadcastReceiver clock;

    private final Runnable tick = this::alignAndPull;

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
    public void onCreate() {
        super.onCreate();
        lastHour = prefs().getLong(KEY_LAST_HOUR, -1);
        // A clock jump or a screen wake after Doze can leave the Handler asleep
        // past its hour; both are reasons to re-align and catch up at once.
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_TIME_CHANGED);
        filter.addAction(Intent.ACTION_DATE_CHANGED);
        filter.addAction(Intent.ACTION_TIMEZONE_CHANGED);
        filter.addAction(Intent.ACTION_SCREEN_ON);
        clock = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                alignAndPull();
            }
        };
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(clock, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(clock, filter);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Every 30-minute APPWIDGET_UPDATE restarts this service too, which
        // recovers the schedule if the process was reclaimed mid-hour.
        alignAndPull();
        return START_STICKY;
    }

    /** Local wall-clock hour boundaries — also handles half-hour time zones. */
    private static Calendar boundary(int hoursAhead) {
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (hoursAhead != 0) cal.add(Calendar.HOUR_OF_DAY, hoursAhead);
        return cal;
    }

    /** Re-arm for the next hour boundary, pulling once if an hour was missed. */
    private void alignAndPull() {
        handler.removeCallbacks(tick);
        long hour = boundary(0).getTimeInMillis();
        if (lastHour < 0 || hour < lastHour) {
            // First start (or the clock moved backwards): adopt this hour, so a
            // random minute is not mistaken for an hour boundary.
            saveHour(hour);
        } else if (hour > lastHour) {
            saveHour(hour);
            hourlyPull();
        }
        long delay = Math.max(1000L,
                boundary(1).getTimeInMillis() - System.currentTimeMillis());
        handler.postDelayed(tick, delay);
        Log.d(TAG, "next hourly pull in " + (delay / 60000) + " min");
    }

    private void hourlyPull() {
        String at = new SimpleDateFormat("HH:mm", Locale.US).format(new Date());
        // 1. Fresh numbers from the live store (no-op without a WebView).
        boolean webAlive = MainActivity.pullWidgetSnapshot();
        // 2. Re-render from the snapshot's hourly table in any case.
        sendBroadcast(new Intent(WidgetBase.ACTION_REFRESH).setPackage(getPackageName()));
        Log.i(TAG, "hourly pull " + at + " · webView=" + (webAlive ? "alive" : "gone"));
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(WidgetData.PREF, Context.MODE_PRIVATE);
    }

    private void saveHour(long hour) {
        lastHour = hour;
        prefs().edit().putLong(KEY_LAST_HOUR, hour).apply();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        if (clock != null) {
            try {
                unregisterReceiver(clock);
            } catch (RuntimeException ignored) {
                // Already unregistered by the system during teardown.
            }
            clock = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
