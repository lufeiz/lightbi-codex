import type { ChartDocument, ChartType, ChartWidget } from '@/types/domain';
import { chartTypeLabels } from '@/types/domain';

const MAX_WIDGETS = 80;
const MAX_FIELD_REFS = 20;
const MAX_FIELD_NAME_SIZE = 80;
const MAX_TEXT_SIZE = 20000;
const validChartTypes = new Set<ChartType>(Object.keys(chartTypeLabels) as ChartType[]);

export function validateChartDocument(document: ChartDocument): string[] {
  const errors: string[] = [];
  if (document.version !== 2) {
    errors.push('仪表盘配置版本不正确，请刷新后重试');
  }
  if (!Array.isArray(document.widgets)) {
    errors.push('仪表盘组件配置格式不正确');
    return errors;
  }
  if (document.widgets.length > MAX_WIDGETS) {
    errors.push(`单个仪表盘最多支持 ${MAX_WIDGETS} 个组件`);
  }

  document.widgets.forEach((widget, index) => {
    errors.push(...validateWidget(widget, index + 1));
  });

  return errors;
}

function validateWidget(widget: ChartWidget, index: number): string[] {
  const errors: string[] = [];
  if (!widget.id.trim()) {
    errors.push(`第 ${index} 个组件缺少组件 ID`);
  }
  if (!validChartTypes.has(widget.type)) {
    errors.push(`第 ${index} 个组件类型不支持`);
  }
  if (!validateGeometry(widget)) {
    errors.push(`第 ${index} 个组件的位置或尺寸不正确`);
  }
  if (!widget.config.title.trim()) {
    errors.push(`第 ${index} 个组件缺少标题`);
  }
  errors.push(...validateFieldRefs(widget.config.dimensions, index, '维度'));
  errors.push(...validateFieldRefs(widget.config.measures, index, '指标'));

  const textContent = widget.config.textContent ?? '';
  const textHtml = widget.config.textHtml ?? '';
  if (textContent.length > MAX_TEXT_SIZE || textHtml.length > MAX_TEXT_SIZE) {
    errors.push(`第 ${index} 个文本组件内容过长`);
  }
  return errors;
}

function validateGeometry(widget: ChartWidget): boolean {
  return [widget.x, widget.y, widget.width, widget.height].every((value) => Number.isFinite(value)) && widget.width > 0 && widget.height > 0;
}

function validateFieldRefs(fields: string[], widgetIndex: number, label: string): string[] {
  const errors: string[] = [];
  if (!Array.isArray(fields)) {
    return [`第 ${widgetIndex} 个组件${label}配置格式不正确`];
  }
  if (fields.length > MAX_FIELD_REFS) {
    errors.push(`第 ${widgetIndex} 个组件${label}最多支持 ${MAX_FIELD_REFS} 个字段`);
  }
  fields.forEach((field) => {
    const nextField = field.trim();
    if (!nextField || nextField.length > MAX_FIELD_NAME_SIZE) {
      errors.push(`第 ${widgetIndex} 个组件包含无效${label}字段`);
    }
  });
  return errors;
}
