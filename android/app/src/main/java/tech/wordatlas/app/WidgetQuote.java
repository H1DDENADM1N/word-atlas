package tech.wordatlas.app;

/** 4x2 / 5x2 daily sentence: full-bleed topic art + IELTS-context example + translation. */
public final class WidgetQuote extends WidgetBase {
    @Override protected String kind() { return "quote"; }
    @Override protected int layout() { return R.layout.widget_quote; }
}
