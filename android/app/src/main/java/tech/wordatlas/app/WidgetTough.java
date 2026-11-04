package tech.wordatlas.app;

/** 2x2 tough-word carousel: full-bleed word illustration + English word + Chinese meaning. */
public final class WidgetTough extends WidgetBase {
    @Override protected String kind() { return "tough"; }
    @Override protected int layout() { return R.layout.widget_tough; }
}
