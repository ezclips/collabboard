type GanttColumn = {
  name: string;
  label: string;
  tree?: boolean;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
  template?: (task: { id: string }) => string;
  editor?: { type: string; map_to: string };
};

type GanttLightboxSection = {
  name: string;
  map_to: string;
  type: 'textarea' | 'select' | 'time' | 'kanban_color';
  height?: number;
  options?: Array<{ key: string; label: string }>;
  focus?: boolean;
};

type GanttLike = {
  config: {
    readonly?: boolean;
    drag_move?: boolean;
    drag_resize?: boolean;
    drag_progress?: boolean;
    auto_scheduling?: boolean;
    date_format?: string;
    grid_width?: number;
    row_height?: number;
    scale_height?: number;
    min_column_width?: number;
    show_progress?: boolean;
    open_tree_initially?: boolean;
    details_on_create?: boolean;
    details_on_dblclick?: boolean;
    columns?: GanttColumn[];
    lightbox?: { sections: GanttLightboxSection[] };
    /**
     * Enables drag-and-drop row reordering in the grid.
     * 'marker' = show a drop-line indicator instead of re-rendering the row
     * continuously during drag, which is more performant for large datasets.
     * false = disabled (used in read-only mode).
     */
    order_branch?: boolean | 'marker';
    /**
     * When false (default), tasks can only be reordered within their current
     * parent branch (siblings only). When true, tasks can be freely moved to
     * any position in the tree, crossing parent boundaries.
     */
    order_branch_free?: boolean;
  };
  locale?: { labels?: Record<string, string> };
  plugins: (features: Record<string, boolean>) => void;
  attachEvent: (name: string, callback: (...args: unknown[]) => unknown) => string;
  ext?: {
    zoom?: {
      init: (config: unknown) => void;
      setLevel: (level: string) => void;
    };
    inlineEditors?: {
      setMapping: (map: {
        init: (controller: unknown, grid: unknown) => void;
        destroy?: () => void;
      }) => void;
    };
  };
  form_blocks?: Record<
    string,
    {
      render: (...args: unknown[]) => string;
      set_value: (...args: unknown[]) => void;
      get_value: (...args: unknown[]) => string;
      focus?: (...args: unknown[]) => void;
    }
  >;
};

declare global {
  interface Window {
    ganttAddTaskHandler?: (taskId?: string) => void;
  }
}

export function configureGantt(
  gantt: GanttLike,
  readonly: boolean,
  onAddTask?: (taskId?: string) => void,
  stageOptions?: Array<{ key: string; label: string }>,
  isInit = false
): void {
  const colorOptions = ['#33B0B4', '#1E88E5', '#F2B134', '#43A047', '#E53935', '#9E9E9E'];

  const normalizeHexColor = (value?: string): string => {
    if (!value) return '';
    const trimmed = String(value).trim();
    if (!trimmed) return '';
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return trimmed.toUpperCase();
    if (/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return `#${trimmed.toUpperCase()}`;
    return '';
  };

  const bindColorPickerInteractions = (node: HTMLElement) => {
    const input = node.querySelector<HTMLInputElement>('.gantt-lightbox-color-text');
    const preview = node.querySelector<HTMLElement>('.gantt-lightbox-color-preview');
    const clearBtn = node.querySelector<HTMLButtonElement>('.gantt-lightbox-color-clear');
    const swatches = Array.from(
      node.querySelectorAll<HTMLButtonElement>('.gantt-lightbox-color-swatch[data-color]')
    );

    const sync = (next: string) => {
      const normalized = normalizeHexColor(next);
      const value = normalized || '';
      if (input) input.value = value;
      if (preview) preview.style.background = value || 'transparent';
      if (clearBtn) clearBtn.style.display = value ? 'inline-flex' : 'none';
    };

    if (input) {
      input.oninput = () => sync(input.value);
      input.onchange = () => sync(input.value);
    }
    if (clearBtn) {
      clearBtn.onclick = (event) => {
        event.preventDefault();
        sync('');
      };
    }
    swatches.forEach((swatch) => {
      swatch.onclick = (event) => {
        event.preventDefault();
        sync(swatch.dataset.color || '');
      };
    });
  };

  gantt.form_blocks = gantt.form_blocks || {};
  gantt.form_blocks.kanban_color = {
    render: () => {
      const swatches = colorOptions
        .map(
          (hex) =>
            `<button type="button" class="gantt-lightbox-color-swatch" data-color="${hex}" style="background-color:${hex}" aria-label="Set color ${hex}"></button>`
        )
        .join('');
      return `
        <div class="gantt-lightbox-color">
          <div class="gantt-lightbox-color-input-wrapper">
            <span class="gantt-lightbox-color-preview"></span>
            <input type="text" class="gantt-lightbox-color-text" placeholder="#43A047" />
            <button type="button" class="gantt-lightbox-color-clear" aria-label="Clear color">×</button>
          </div>
          <div class="gantt-lightbox-color-swatches">
            <button type="button" class="gantt-lightbox-color-swatch clear" data-color="" aria-label="Clear color">×</button>
            ${swatches}
          </div>
        </div>
      `.trim();
    },
    set_value: (node: unknown, value: unknown) => {
      const root = node as HTMLElement;
      bindColorPickerInteractions(root);
      const input = root.querySelector<HTMLInputElement>('.gantt-lightbox-color-text');
      const preview = root.querySelector<HTMLElement>('.gantt-lightbox-color-preview');
      const clearBtn = root.querySelector<HTMLButtonElement>('.gantt-lightbox-color-clear');
      const normalized = normalizeHexColor(String(value || ''));
      if (input) input.value = normalized;
      if (preview) preview.style.background = normalized || 'transparent';
      if (clearBtn) clearBtn.style.display = normalized ? 'inline-flex' : 'none';
    },
    get_value: (node: unknown) => {
      const root = node as HTMLElement;
      const input = root.querySelector<HTMLInputElement>('.gantt-lightbox-color-text');
      return normalizeHexColor(input?.value || '');
    },
    focus: (node: unknown) => {
      const root = node as HTMLElement;
      const input = root.querySelector<HTMLInputElement>('.gantt-lightbox-color-text');
      input?.focus();
    },
  };

  // Fix broken getTaskType stub in dhtmlx-gantt npm ES module build.
  // The ES module ships `getTaskType = () => "task"` (always "task") while the
  // CDN build has the real lookup. Without this patch, milestone/project CSS
  // classes are never applied and milestones render as blue bars.
  const ganttWithTaskType = gantt as GanttLike & {
    getTaskType?: (d: unknown) => string;
    config: GanttLike['config'] & { types?: Record<string, unknown> };
  };
  ganttWithTaskType.getTaskType = function(this: unknown, d: unknown): string {
    let u: unknown = d;
    if (d && typeof d === 'object') u = (d as { type?: unknown }).type;
    const types: Record<string, unknown> = ganttWithTaskType.config.types || {};
    for (const c in types) {
      if (types[c] === u) return u as string;
    }
    return 'task';
  };

  gantt.config.readonly = readonly;
  gantt.config.drag_move = !readonly;
  gantt.config.drag_resize = !readonly;
  gantt.config.drag_progress = !readonly;
  gantt.config.auto_scheduling = false;
  // Grid row reordering: 'marker' shows a drop-line instead of continuously
  // re-rendering the row during drag (better for large datasets). Disabled in
  // read-only mode where no mutations are allowed.
  gantt.config.order_branch = readonly ? false : 'marker';
  // Restrict reordering to siblings only (same parent). Set to true to allow
  // tasks to be freely moved across branches to any position in the tree.
  gantt.config.order_branch_free = false;
  gantt.config.date_format = '%Y-%m-%d';
  gantt.config.grid_width = 400;
  gantt.config.row_height = 38;
  gantt.config.scale_height = 54;
  gantt.config.min_column_width = 44;
  gantt.config.show_progress = true;
  gantt.config.open_tree_initially = true;
  gantt.config.details_on_create = true;
  gantt.config.details_on_dblclick = true;

  const columns: GanttColumn[] = [
    { name: 'text', label: 'Task name', tree: true, width: '*', editor: readonly ? undefined : { type: 'text', map_to: 'text' } },
    { name: 'start_date', label: 'Start time', align: 'center', width: 95 },
    { name: 'duration', label: 'Duration', align: 'center', width: 70 },
  ];

  // Add the "+" button column if not readonly and callback is provided
  // Clicking "+" opens NewTaskModal to create a child task:
  // - Shows black arrow pointer on parent indicating expandable hierarchy
  // - User selects Stage (Kanban column) where card will be added
  // - Creates new card at bottom of selected column
  // - To delete: remove the card from Kanban board (not directly in Gantt)
  if (!readonly && onAddTask) {
    columns.push({
      name: 'add',
      label: '',
      width: 40,
      align: 'center',
      template: (task: { id: string }) => {
        return `<button 
          class="gantt-add-task-btn" 
          data-task-id="${task.id}"
          onclick="event.stopPropagation(); window.ganttAddTaskHandler && window.ganttAddTaskHandler('${task.id}');"
          title="Add child task"
        >+</button>`;
      },
    });

    // Store the callback globally so the button onclick can access it
    window.ganttAddTaskHandler = onAddTask;
  }

  gantt.config.columns = columns;

  // Ensure the default DHTMLX lightbox contains full task fields (Label, Description, Stage, Type, Time period)
  // even when users open it via default interactions.
  const stageSelectOptions = stageOptions && stageOptions.length > 0
    ? stageOptions
    : [{ key: '', label: 'Select stage' }];
  const typeSelectOptions = [
    { key: 'Feature', label: 'Feature' },
    { key: 'Task', label: 'Task' },
    { key: 'Milestone', label: 'Milestone' },
  ];

  gantt.locale = gantt.locale || {};
  gantt.locale.labels = {
    ...(gantt.locale.labels || {}),
    section_label: 'Label',
    section_description: 'Description',
    section_stage: 'Stage',
    section_tasktype: 'Type',
    section_color: 'Color',
    section_time: 'Time period',
  };

  gantt.config.lightbox = {
    sections: [
      { name: 'label', map_to: 'text', type: 'textarea', height: 38, focus: true },
      { name: 'description', map_to: 'description', type: 'textarea', height: 72 },
      { name: 'stage', map_to: 'stage_id', type: 'select', options: stageSelectOptions },
      { name: 'tasktype', map_to: 'task_type', type: 'select', options: typeSelectOptions },
      { name: 'color', map_to: 'color', type: 'kanban_color', height: 74 },
      { name: 'time', map_to: 'auto', type: 'time' },
    ],
  };

  // Plugins and zoom must only be initialised once, before gantt.init().
  // Calling gantt.plugins() a second time (e.g. from the reconfigure effect)
  // causes DHTMLX to reinitialise and silently clear all task data.
  if (isInit) {
    gantt.plugins({
      tooltip: false,
      undo: true,
      quick_info: false,
      keyboard_navigation: true,
      inline_editors: true,
    });

    // Change inline editor trigger from single-click to double-click.
    // The default mapping opens the editor on every onTaskClick, which intercepts
    // the mousedown that starts a row drag. By replacing the mapping to use
    // onTaskDblClick instead, a single click leaves the row free to be dragged
    // while a double-click on an editable column (e.g. task name) opens the
    // inline editor. Double-clicking on the task bar or non-editable columns
    // still opens the full lightbox (returns true → default behaviour).
    if (gantt.ext?.inlineEditors) {
      type InlineCtrl = {
        locateCell: (target: EventTarget | null) => { id: string; columnName: string } | null;
        getEditorConfig: (col: string) => unknown;
        isVisible: () => boolean;
        isChanged: () => boolean;
        getState: () => { id: string; columnName: string };
        startEdit: (id: string, col: string) => void;
        save: () => void;
        hide: () => void;
      };
      gantt.ext.inlineEditors.setMapping({
        init: (controller: unknown) => {
          const ctrl = controller as InlineCtrl & {
            attachEvent: (name: string, cb: (...args: unknown[]) => void) => string;
          };
          const maybeGanttInternal = gantt as GanttLike & {
            _is_icon_open_click?: (ev: unknown) => boolean;
          };

          const commitOrHideEditor = () => {
            if (!ctrl.isVisible()) return;
            if (ctrl.isChanged()) ctrl.save();
            else ctrl.hide();
          };

          // Preserve default "click-away" behavior so inline edits are applied.
          gantt.attachEvent('onTaskClick', (_id: unknown, e: unknown) => {
            if (maybeGanttInternal._is_icon_open_click?.(e)) return true;
            commitOrHideEditor();
            return true;
          });
          gantt.attachEvent('onEmptyClick', () => {
            commitOrHideEditor();
            return true;
          });
          gantt.attachEvent('onBeforeTaskDrag', () => {
            commitOrHideEditor();
            return true;
          });

          gantt.attachEvent('onTaskDblClick', (id: unknown, e: unknown) => {
            const ev = e as MouseEvent;
            const cell = ctrl.locateCell(ev.target);
            if (cell && ctrl.getEditorConfig(cell.columnName)) {
              // Hide the underlying cell text so it doesn't show through the editor.
              // We add a class to the row (traversed from the click target) and
              // remove it once the editor closes via onEditEnd.
              const rowEl = (ev.target instanceof Element)
                ? ev.target.closest('.gantt_row')
                : null;
              if (rowEl) rowEl.classList.add('gantt-row-editing');

              const state = ctrl.getState();
              if (!(ctrl.isVisible() && state.id === cell.id && state.columnName === cell.columnName)) {
                ctrl.startEdit(cell.id, cell.columnName);
              }
              // Return false so the lightbox does NOT open on editable columns.
              return false;
            }
            // Non-editable column / bar: let the lightbox open normally.
            return true;
          });

          // Clean up the editing class when the editor closes for any reason.
          ctrl.attachEvent('onEditEnd', () => {
            document.querySelectorAll('.gantt-row-editing').forEach((el) => {
              el.classList.remove('gantt-row-editing');
            });
          });
        },
        destroy: () => {},
      });
    }

    if (gantt.ext?.zoom) {
      gantt.ext.zoom.init({
        levels: [
          {
            name: 'day',
            scale_height: 52,
            min_column_width: 52,
            scales: [
              { unit: 'day', step: 1, format: '%d %M' },
            ],
          },
          {
            name: 'week',
            scale_height: 52,
            min_column_width: 42,
            scales: [
              { unit: 'week', step: 1, format: 'Week #%W' },
              { unit: 'day', step: 1, format: '%D' },
            ],
          },
          {
            name: 'month',
            scale_height: 52,
            min_column_width: 86,
            scales: [
              { unit: 'month', step: 1, format: '%F %Y' },
              { unit: 'week', step: 1, format: 'W%W' },
            ],
          },
        ],
      });
      gantt.ext.zoom.setLevel('week');
    }
  }
}
