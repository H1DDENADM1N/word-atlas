package tech.wordatlas.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.util.Log;

import java.io.IOException;
import java.io.InputStream;

/** Builds the full-bleed widget background as a single, small, round-cornered bitmap. */
final class WidgetArt {

    private static final String TAG = "WordAtlasWidget";
    /** Fixed target sizes keep each bitmap well under the ~1 MB Binder limit. */
    private static final int TOUGH_W = 300;
    private static final int TOUGH_H = 480;
    private static final int QUOTE_W = 480;
    private static final int QUOTE_H = 300;

    private WidgetArt() {}

    static Bitmap tough(Context ctx, String id) {
        return compose(ctx, "www/atlas/img/" + id + ".webp", TOUGH_W, TOUGH_H);
    }

    /** The daily sentence uses the word's own illustration, exactly like the in-app word card. */
    static Bitmap quote(Context ctx, String id) {
        return compose(ctx, "www/atlas/img/" + id + ".webp", QUOTE_W, QUOTE_H);
    }

    /** Fallback when a word's illustration is missing. */
    static Bitmap topic(Context ctx, String topic, int width, int height) {
        return compose(ctx, "www/brand/topic-" + topic + ".webp", width, height);
    }

    /**
     * centerCrop -> rounded corners, in one pass, with no tint baked in.
     *
     * <p>RemoteViews cannot clip an ImageView, so the corners have to be
     * transparent pixels in the bitmap itself. That rules out RGB_565: the
     * downscaled ARGB_8888 result is ~0.58 MB, already inside the Binder limit.
     * Android 12+ adds its own corner mask; doing it here also covers API 24-30.
     *
     * <p>No tint is baked in here: the plate that keeps the text readable is a
     * layout layer ({@code drawable/widget_body_bg.xml}), so a RemoteViews
     * replay — which keeps the bitmap it was handed but re-inflates the layout —
     * still lets a card follow the system's light/dark mode.
     */
    private static Bitmap compose(Context ctx, String asset, int width, int height) {
        Bitmap src = null;
        try (InputStream in = ctx.getAssets().open(asset)) {
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
            src = BitmapFactory.decodeStream(in, null, opts);
        } catch (IOException | OutOfMemoryError e) {
            Log.w(TAG, "missing widget art: " + asset, e);
            return null;
        }
        if (src == null) return null;
        try {
            Bitmap out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(out);
            float radius = Math.min(width, height) * 0.075f;
            Path clip = new Path();
            clip.addRoundRect(new RectF(0, 0, width, height), radius, radius, Path.Direction.CW);
            canvas.clipPath(clip);

            float scale = Math.max((float) width / src.getWidth(), (float) height / src.getHeight());
            float dw = src.getWidth() * scale;
            float dh = src.getHeight() * scale;
            RectF dst = new RectF((width - dw) / 2f, (height - dh) / 2f, (width + dw) / 2f, (height + dh) / 2f);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
            canvas.drawBitmap(src, null, dst, paint);
            return out;
        } catch (OutOfMemoryError e) {
            Log.w(TAG, "widget art out of memory", e);
            return null;
        } finally {
            src.recycle();
        }
    }
}
