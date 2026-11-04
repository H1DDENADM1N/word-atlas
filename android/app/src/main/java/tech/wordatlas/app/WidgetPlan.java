package tech.wordatlas.app;

/** 4x1 progress strip: four figures and the "继续旅程" capsule button. */
public final class WidgetPlan extends WidgetBase {
    @Override protected String kind() { return "plan"; }
    @Override protected int layout() { return R.layout.widget_plan; }
}
