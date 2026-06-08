import { CalendarOutlined, DeleteOutlined, FilterOutlined, PlusOutlined, SlidersOutlined } from '@ant-design/icons';
import { Button, DatePicker, Input, Modal, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';

import { useDesignerStore } from '@/store/designerStore';
import type { ChartWidget, DashboardDimensionFilter, DashboardFilters } from '@/types/domain';

const { RangePicker } = DatePicker;

interface ChartOption {
  value: string;
  label: string;
}

interface DimensionDraft {
  id?: string;
  label: string;
  chartIds: string[];
}

interface WidgetDimension {
  field: string;
  label: string;
}

const defaultFieldLabels: Record<string, string> = {
  category: '业务域',
  region: '区域',
  month: '月份',
  product: '产品线',
  value: '销售额',
  lastYear: '去年同期',
  profit: '利润',
  orders: '订单数'
};

interface DashboardFilterBarProps {
  widgets?: ChartWidget[];
  runtimeRows?: Record<string, unknown[]>;
  filters?: DashboardFilters;
  onFiltersChange?: (filters: Partial<DashboardFilters>) => void;
  compact?: boolean;
  allowConfigure?: boolean;
}

export function DashboardFilterBar(props: DashboardFilterBarProps = {}) {
  const storeWidgets = useDesignerStore((state) => state.widgets);
  const storeRuntimeRows = useDesignerStore((state) => state.runtimeRows);
  const storeFilters = useDesignerStore((state) => state.filters);
  const storeSetFilters = useDesignerStore((state) => state.setFilters);
  const widgets = props.widgets ?? storeWidgets;
  const runtimeRows = props.runtimeRows ?? storeRuntimeRows;
  const filters = props.filters ?? storeFilters;
  const setFilters = props.onFiltersChange ?? storeSetFilters;
  const compact = props.compact ?? false;
  const allowConfigure = props.allowConfigure ?? true;
  const chartOptions = useMemo(() => buildChartOptions(widgets), [widgets]);
  const normalizedControls = useMemo(
    () => normalizeDimensionControls(filters.dimensionControls, widgets, runtimeRows),
    [filters.dimensionControls, runtimeRows, widgets]
  );
  const [dimensionDraft, setDimensionDraft] = useState<DimensionDraft | null>(null);
  const timeEnabled = Boolean(filters.timeFilter.enabled || filters.timeFilter.range);
  const timeRangeValue: [Dayjs, Dayjs] | null = filters.timeFilter.range
    ? [dayjs(filters.timeFilter.range[0]), dayjs(filters.timeFilter.range[1])]
    : null;

  useEffect(() => {
    const nextTimeFilter = {
      label: filters.timeFilter.label || '日期',
      enabled: Boolean(filters.timeFilter.enabled || filters.timeFilter.range),
      range: filters.timeFilter.range ?? null
    };

    if (
      JSON.stringify(nextTimeFilter) !== JSON.stringify(filters.timeFilter) ||
      JSON.stringify(normalizedControls) !== JSON.stringify(filters.dimensionControls)
    ) {
      setFilters({
        timeFilter: nextTimeFilter,
        dimensionControls: normalizedControls
      });
    }
  }, [filters.dimensionControls, filters.timeFilter, normalizedControls, setFilters]);

  const updateTimeFilter = (patch: Partial<DashboardFilters['timeFilter']>) => {
    setFilters({
      timeFilter: {
        label: filters.timeFilter.label || '日期',
        enabled: timeEnabled,
        range: filters.timeFilter.range ?? null,
        ...patch
      }
    });
  };

  const addTimeFilter = () => {
    updateTimeFilter({ enabled: true, label: filters.timeFilter.label || '日期' });
  };

  const deleteTimeFilter = () => {
    updateTimeFilter({ enabled: false, label: '日期', range: null });
  };

  const openDimensionModal = (control?: DashboardDimensionFilter) => {
    setDimensionDraft({
      id: control?.id,
      label: control?.label || '维度',
      chartIds: control?.chartIds?.length ? control.chartIds : control?.chartId ? [control.chartId] : []
    });
  };

  const updateDimensionValues = (id: string, values: string[]) => {
    setFilters({
      dimensionControls: normalizedControls.map((control) =>
        control.id === id ? normalizeDimensionControl({ ...control, values }, widgets, runtimeRows) : control
      )
    });
  };

  const deleteDimensionControl = (id: string) => {
    setFilters({ dimensionControls: normalizedControls.filter((control) => control.id !== id) });
  };

  const confirmDimensionModal = () => {
    if (!dimensionDraft) {
      return;
    }

    const existingControl = normalizedControls.find((control) => control.id === dimensionDraft.id);
    const nextControl = normalizeDimensionControl(
      {
        id: dimensionDraft.id ?? createFilterId(),
        label: dimensionDraft.label.trim() || '维度',
        chartIds: dimensionDraft.chartIds,
        field: existingControl?.field ?? '',
        fieldsByChart: existingControl?.fieldsByChart ?? {},
        values: existingControl?.values ?? []
      },
      widgets,
      runtimeRows
    );
    const nextControls = existingControl
      ? normalizedControls.map((control) => (control.id === existingControl.id ? nextControl : control))
      : [...normalizedControls, nextControl];

    setFilters({ dimensionControls: nextControls });
    setDimensionDraft(null);
  };

  return (
    <section className={compact ? 'filter-sidebar-content filter-sidebar-content-compact' : 'filter-sidebar-content'} aria-label="筛选栏">
      <div className="filter-sidebar-heading">
        <FilterOutlined />
        <Typography.Text>筛选栏</Typography.Text>
      </div>

      {allowConfigure && (
        <div className="filter-dynamic-actions">
          {!timeEnabled && (
            <Button icon={<CalendarOutlined />} onClick={addTimeFilter}>
              添加日期
            </Button>
          )}
          <Button icon={<PlusOutlined />} onClick={() => openDimensionModal()}>
            添加维度
          </Button>
        </div>
      )}

      <div className="filter-dynamic-controls">
        {timeEnabled && (
          <div className="filter-inline-control dynamic-filter-item">
            <Input
              className="filter-name-input"
              value={filters.timeFilter.label}
              placeholder="日期"
              onChange={(event) => updateTimeFilter({ label: event.target.value || '日期' })}
            />
            <RangePicker
              allowClear
              value={timeRangeValue}
              placeholder={['开始日期', '结束日期']}
              onChange={(dates) => {
                const range =
                  dates?.[0] && dates[1]
                    ? ([dates[0].startOf('day').toISOString(), dates[1].endOf('day').toISOString()] as [string, string])
                    : null;
                updateTimeFilter({ range });
              }}
            />
            <Button
              aria-label="删除日期"
              className="dimension-delete-button"
              danger
              icon={<DeleteOutlined />}
              disabled={!allowConfigure}
              type="text"
              onClick={deleteTimeFilter}
            />
          </div>
        )}
        {normalizedControls.length > 0 && (
          <div className="filter-config-card">
            <div className="filter-config-card-title">
              <SlidersOutlined />
              <Typography.Text>维度控件</Typography.Text>
            </div>
            <div className="dimension-control-list">
              {normalizedControls.map((control) => {
                const valueOptions = buildDimensionValueOptions(widgets, runtimeRows, control);
                return (
                  <div key={control.id} className="dimension-control-row">
                    <Input
                      readOnly
                      className="filter-name-input dimension-name-trigger"
                      value={control.label || '维度'}
                      placeholder="维度"
                      onClick={() => {
                        if (allowConfigure) {
                          openDimensionModal(control);
                        }
                      }}
                    />
                    <Select
                      allowClear
                      showSearch
                      mode="multiple"
                      maxTagCount="responsive"
                      className="filter-value-select"
                      disabled={!control.chartIds?.length || !valueOptions.length}
                      value={control.values}
                      placeholder={`筛选${control.label || '维度'}`}
                      optionFilterProp="label"
                      options={valueOptions}
                      onChange={(values) => updateDimensionValues(control.id, values)}
                    />
                    <Button
                      aria-label={`删除${control.label || '维度'}`}
                      className="dimension-delete-button"
                      danger
                      icon={<DeleteOutlined />}
                      disabled={!allowConfigure}
                      type="text"
                      onClick={() => deleteDimensionControl(control.id)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Modal
        title="配置维度"
        open={Boolean(dimensionDraft)}
        okText="确定"
        cancelText="取消"
        destroyOnHidden
        okButtonProps={{ disabled: !dimensionDraft?.chartIds.length }}
        onOk={confirmDimensionModal}
        onCancel={() => setDimensionDraft(null)}
      >
        <div className="dimension-config-modal-body">
          <label className="dimension-config-field">
            <Typography.Text>维度名称</Typography.Text>
            <Input
              value={dimensionDraft?.label ?? '维度'}
              placeholder="请输入维度名称"
              onChange={(event) => setDimensionDraft((draft) => (draft ? { ...draft, label: event.target.value } : draft))}
            />
          </label>
          <label className="dimension-config-field">
            <Typography.Text>关联图表</Typography.Text>
            <Select
              mode="multiple"
              showSearch
              maxTagCount="responsive"
              value={dimensionDraft?.chartIds ?? []}
              placeholder="选择关联图表"
              optionFilterProp="label"
              options={chartOptions}
              onChange={(chartIds) => setDimensionDraft((draft) => (draft ? { ...draft, chartIds } : draft))}
            />
          </label>
        </div>
      </Modal>
    </section>
  );
}

function normalizeDimensionControls(controls: DashboardDimensionFilter[], widgets: ChartWidget[], runtimeRows: Record<string, unknown[]>): DashboardDimensionFilter[] {
  return controls.map((control) => normalizeDimensionControl(control, widgets, runtimeRows));
}

function normalizeDimensionControl(control: DashboardDimensionFilter, widgets: ChartWidget[], runtimeRows: Record<string, unknown[]>): DashboardDimensionFilter {
  const label = control.label || '维度';
  const chartIds = normalizeChartIds(control, widgets);
  const fieldsByChart = buildFieldsByChart(widgets, label, chartIds, control.fieldsByChart, control.field);
  const field = Object.values(fieldsByChart)[0] ?? control.field ?? '';
  const valueOptions = buildDimensionValueOptions(widgets, runtimeRows, { ...control, label, chartIds, field, fieldsByChart, values: [] });
  const validValues = new Set(valueOptions.map((option) => option.value));

  return {
    id: control.id || createFilterId(),
    label,
    chartIds,
    field,
    fieldsByChart,
    values: control.values.filter((value) => validValues.has(value))
  };
}

function normalizeChartIds(control: DashboardDimensionFilter, widgets: ChartWidget[]): string[] {
  const validChartIds = new Set(widgets.filter((widget) => widget.type !== 'text' && widget.type !== 'richText').map((widget) => widget.id));
  const explicitChartIds = control.chartIds?.length ? control.chartIds : control.chartId ? [control.chartId] : [];
  const chartIds = explicitChartIds.map(String).filter((chartId) => validChartIds.has(chartId));

  if (chartIds.length || !control.field) {
    return [...new Set(chartIds)];
  }

  return widgets
    .filter((widget) => widget.type !== 'text' && widget.type !== 'richText' && widget.config.dimensions.includes(control.field))
    .map((widget) => widget.id);
}

function buildChartOptions(widgets: ChartWidget[]): ChartOption[] {
  return widgets
    .filter((widget) => widget.type !== 'text' && widget.type !== 'richText')
    .map((widget) => ({
      value: widget.id,
      label: widget.config.title || '未命名图表'
    }));
}

function buildDimensionValueOptions(widgets: ChartWidget[], runtimeRows: Record<string, unknown[]>, control: DashboardDimensionFilter): ChartOption[] {
  const valueSet = new Set<string>();
  const targetChartIds = control.chartIds?.length ? control.chartIds : [];

  targetChartIds.forEach((chartId) => {
    const widget = widgets.find((item) => item.id === chartId);
    if (!widget || widget.type === 'text') {
      return;
    }
    const field = control.fieldsByChart?.[chartId] || resolveDimensionField(widget, control.label, control.field);
    if (!field) {
      return;
    }
    const rows = (runtimeRows[chartId] as Record<string, string | number | null>[] | undefined) ?? widget.config.previewRows ?? [];
    rows.forEach((row) => {
      const value = row[field];
      if (value !== null && value !== undefined) {
        valueSet.add(String(value));
      }
    });
  });

  return [...valueSet]
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
    .map((value) => ({
      value,
      label: value
    }));
}

function buildFieldsByChart(
  widgets: ChartWidget[],
  label: string,
  chartIds: string[],
  previousFields: Record<string, string> = {},
  fallbackField = ''
): Record<string, string> {
  return chartIds.reduce<Record<string, string>>((result, chartId) => {
    const widget = widgets.find((item) => item.id === chartId);
    if (!widget || widget.type === 'text') {
      return result;
    }
    const field = resolveDimensionField(widget, label, previousFields[chartId] || fallbackField);
    if (field) {
      result[chartId] = field;
    }
    return result;
  }, {});
}

function resolveDimensionField(widget: ChartWidget, label: string, preferredField = ''): string {
  const dimensions = getWidgetDimensions(widget);
  if (!dimensions.length) {
    return '';
  }
  if (preferredField && dimensions.some((dimension) => dimension.field === preferredField)) {
    return preferredField;
  }

  const normalizedLabel = label.trim();
  const exactLabelMatch = dimensions.find((dimension) => dimension.label === normalizedLabel);
  const exactFieldMatch = dimensions.find((dimension) => dimension.field === normalizedLabel);
  const looseLabelMatch =
    normalizedLabel && normalizedLabel !== '维度'
      ? dimensions.find((dimension) => dimension.label.includes(normalizedLabel) || normalizedLabel.includes(dimension.label))
      : undefined;

  return exactLabelMatch?.field ?? exactFieldMatch?.field ?? looseLabelMatch?.field ?? dimensions[0].field;
}

function getWidgetDimensions(widget: ChartWidget): WidgetDimension[] {
  if (widget.type === 'text') {
    return [];
  }
  return widget.config.dimensions
    .map((field) => ({
      field,
      label: displayFieldName(widget, field)
    }))
    .filter((dimension) => !isTimeField(dimension.field, dimension.label));
}

function createDimensionControl(): DashboardDimensionFilter {
  return {
    id: createFilterId(),
    label: '维度',
    chartIds: [],
    field: '',
    fieldsByChart: {},
    values: []
  };
}

function createFilterId(): string {
  return `filter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function displayFieldName(widget: ChartWidget, field: string): string {
  return widget.config.fieldLabels?.[field] ?? defaultFieldLabels[field] ?? field;
}

function isTimeField(field: string, label: string): boolean {
  return /date|time|month|year|day|dt/i.test(field) || /时间|日期|月份|年月|年份|年|月|日/.test(label);
}
