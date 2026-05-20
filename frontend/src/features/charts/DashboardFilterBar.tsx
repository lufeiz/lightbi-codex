import { ClearOutlined, FilterOutlined } from '@ant-design/icons';
import { Button, DatePicker, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useEffect, useMemo } from 'react';

import { useDesignerStore } from '@/store/designerStore';
import type { ChartWidget, DashboardDimensionFilter } from '@/types/domain';

const { RangePicker } = DatePicker;

interface DimensionOption {
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

export function DashboardFilterBar() {
  const widgets = useDesignerStore((state) => state.widgets);
  const selectedWidgetId = useDesignerStore((state) => state.selectedWidgetId);
  const filters = useDesignerStore((state) => state.filters);
  const setFilters = useDesignerStore((state) => state.setFilters);
  const resetFilters = useDesignerStore((state) => state.resetFilters);
  const selectedWidget = widgets.find((widget) => widget.id === selectedWidgetId) ?? widgets.find((widget) => widget.type !== 'text') ?? null;
  const filterTargetWidget = useMemo(() => {
    if (buildWidgetDimensionOptions(selectedWidget).length) {
      return selectedWidget;
    }
    return widgets.find((widget) => buildWidgetDimensionOptions(widget).length > 0) ?? selectedWidget;
  }, [selectedWidget, widgets]);
  const dimensionOptions = useMemo(() => buildWidgetDimensionOptions(filterTargetWidget), [filterTargetWidget]);
  const selectedChartFilters = filterTargetWidget ? filters.chartDimensionFilters[filterTargetWidget.id] ?? [] : [];
  const rangeValue: [Dayjs, Dayjs] | null = filters.timeRange
    ? [dayjs(filters.timeRange[0]), dayjs(filters.timeRange[1])]
    : null;

  useEffect(() => {
    const validWidgetIds = new Set(widgets.map((widget) => widget.id));
    const nextFilters = Object.entries(filters.chartDimensionFilters).reduce<Record<string, DashboardDimensionFilter[]>>(
      (result, [widgetId, items]) => {
        const widget = widgets.find((candidate) => candidate.id === widgetId);
        if (!widget || !validWidgetIds.has(widgetId)) {
          return result;
        }
        const validFields = new Set(buildWidgetDimensionOptions(widget).map((option) => option.field));
        const nextItems = items.filter((item) => validFields.has(item.field));
        if (nextItems.length) {
          result[widgetId] = nextItems;
        }
        return result;
      },
      {}
    );
    if (JSON.stringify(nextFilters) !== JSON.stringify(filters.chartDimensionFilters)) {
      setFilters({ chartDimensionFilters: nextFilters });
    }
  }, [filters.chartDimensionFilters, setFilters, widgets]);

  const changeDimensionValues = (field: string, values: string[]) => {
    if (!filterTargetWidget) {
      return;
    }
    const previousFilters = filters.chartDimensionFilters[filterTargetWidget.id] ?? [];
    const withoutCurrentField = previousFilters.filter((filter) => filter.field !== field);
    const nextWidgetFilters = values.length ? [...withoutCurrentField, { field, values }] : withoutCurrentField;
    setFilters({
      chartDimensionFilters: {
        ...filters.chartDimensionFilters,
        [filterTargetWidget.id]: nextWidgetFilters
      }
    });
  };

  return (
    <section className="dashboard-filter-bar" aria-label="仪表盘筛选">
      <div className="filter-section-title">
        <FilterOutlined />
        <Typography.Text>全局筛选</Typography.Text>
      </div>
      <div className="filter-control-list">
        <div className="dimension-filter-control">
          <Typography.Text className="dimension-filter-label">时间</Typography.Text>
          <RangePicker
            allowClear
            value={rangeValue}
            placeholder={['开始时间', '结束时间']}
            onChange={(dates) => {
              const nextRange =
                dates?.[0] && dates[1]
                  ? ([dates[0].startOf('day').toISOString(), dates[1].endOf('day').toISOString()] as [string, string])
                  : null;
              setFilters({ timeRange: nextRange });
            }}
          />
        </div>
      </div>

      <div className="filter-section-title single-chart-filter-title">
        <Typography.Text>单图表筛选</Typography.Text>
      </div>
      <div className="filter-control-list single-chart-filter-list">
        {filterTargetWidget && dimensionOptions.length ? (
          dimensionOptions.map((dimension) => (
            <div key={`${filterTargetWidget.id}-${dimension.field}`} className="dimension-filter-control">
              <Typography.Text className="dimension-filter-label">{dimension.label}</Typography.Text>
              <Select
                allowClear
                showSearch
                className="filter-value-select"
                value={selectedChartFilters.find((filter) => filter.field === dimension.field)?.values[0]}
                placeholder={`筛选${dimension.label}`}
                optionFilterProp="label"
                options={buildDimensionValueOptions(filterTargetWidget, dimension.field)}
                onChange={(value) => changeDimensionValues(dimension.field, value ? [String(value)] : [])}
              />
            </div>
          ))
        ) : (
          <Typography.Text className="empty-filter-tip" type="secondary">
            暂无可筛选维度
          </Typography.Text>
        )}
      </div>

      <Button className="filter-reset-button" icon={<ClearOutlined />} onClick={resetFilters}>
        重置
      </Button>
    </section>
  );
}

function buildWidgetDimensionOptions(widget: ChartWidget | null): DimensionOption[] {
  if (!widget || widget.type === 'text') {
    return [];
  }

  const optionMap = new Map<string, string>();
  widget.config.dimensions.forEach((field) => {
    const label = displayFieldName(widget, field);
    if (!isTimeField(field, label) && !optionMap.has(field)) {
      optionMap.set(field, label);
    }
  });

  return [...optionMap.entries()].map(([field, label]) => ({
    field,
    label
  }));
}

function buildDimensionValueOptions(widget: ChartWidget, field: string) {
  const valueSet = new Set<string>();
  widget.config.previewRows?.forEach((row) => {
    const value = row[field];
    if (value !== null && value !== undefined) {
      valueSet.add(String(value));
    }
  });

  return [...valueSet]
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
    .map((value) => ({
      value,
      label: value
    }));
}

function displayFieldName(widget: ChartWidget, field: string): string {
  return widget.config.fieldLabels?.[field] ?? defaultFieldLabels[field] ?? field;
}

function isTimeField(field: string, label: string): boolean {
  return /date|time|month|year|day|dt/i.test(field) || /时间|日期|月份|年月|年份|年|月|日/.test(label);
}
