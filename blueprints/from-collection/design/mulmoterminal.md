<!-- Copied from @mulmoclaude/collection-plugin 5.5.0 (mulmoclaude 796f2e297). -->

# MulmoTerminal collection look

Reproduce MulmoTerminal's collection screens by copying the class strings below exactly as
written. Tailwind only generates classes it finds as complete string literals in the source.
Never build a class from a variable (`` `bg-${color}-50` ``). When a class depends on data,
write out a lookup table of whole strings, as the plugin does in `enumColors.ts` and
`accentColor.ts`. Icons are Material Symbols Outlined from the `material-symbols` npm package
(`import "material-symbols/outlined.css"`): `<span class="material-symbols-outlined">name</span>`.
The plugin's own markup writes `material-icons` for most glyphs. The glyph names below are the
same in both fonts, so write `material-symbols-outlined` wherever this file shows an icon, and
keep the size class (`text-sm`, `text-lg`, ...) next to it.

The palette is `slate` for neutrals, `indigo` for primary and selected states, `rose` for
destructive actions, and `red` for errors.

## Page shell

```html
<div class="h-full flex flex-col bg-slate-50/30">
  <!-- header, toolbar -->
  <div class="flex-1 overflow-auto"><!-- body: table / kanban / calendar / states --></div>
</div>
```

Body states:

| state | classes |
|---|---|
| loading | `flex flex-col items-center justify-center py-20 text-sm text-slate-500 gap-3`, spinner `h-8 w-8 border-2 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin` |
| load error | `m-6 rounded-xl border border-red-200 bg-red-50/50 p-4 text-sm text-red-800 shadow-sm flex items-center gap-3`, icon `error` with `text-red-600` |
| empty collection | `flex flex-col items-center justify-center py-20 text-sm text-slate-400 gap-2`, icon `folder_open` `text-4xl text-slate-300`, message `<p class="font-semibold text-slate-600">` |
| no search match | same wrapper, icon `search_off`, plus a clear link `text-xs text-indigo-600 font-semibold hover:underline` |
| info note | `mx-6 mt-2 rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-2 text-sm text-indigo-800 flex items-center gap-2`, icon `text-base text-indigo-600` |
| table wrapper | `overflow-x-auto [container-type:inline-size]` |
| kanban wrapper | `h-full flex flex-col`, inner `flex-1 min-h-0 px-3 py-2` |
| calendar wrapper | `p-4` |

## Header

```
header:   flex items-center gap-3 px-6 py-2 border-b border-slate-200 bg-white
back:     h-8 w-8 flex items-center justify-center rounded text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors   (icon arrow_back, text-lg)
icon box: h-9 w-9 flex items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100   (glyph text-xl)
title:    wrapper flex-1 min-w-0; h1 text-base font-bold text-slate-800 truncate
subtitle: block text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate   (the slug)
read-only chip: inline-flex items-center gap-0.5 ml-1.5 px-1.5 py-px rounded bg-amber-50 text-amber-700 border border-amber-200 normal-case tracking-normal   (icon lock text-[11px])
```

Inside the collection page the plugin draws the header icon box in fixed indigo, whatever the
schema's `color` is. The schema's `color` is used where the collection appears as a shortcut
(MulmoClaude's launcher, dashboard tiles and shortcut list), as a pale chip behind the icon
(`h-6 w-6 rounded flex items-center justify-center flex-none` plus the chip classes). The
seven colours, from `accentColor.ts`:

| `color` | chip classes |
|---|---|
| `violet` | `bg-violet-50 text-violet-700` |
| `indigo` | `bg-indigo-50 text-indigo-700` |
| `sky` | `bg-sky-50 text-sky-700` |
| `teal` | `bg-teal-50 text-teal-700` |
| `emerald` | `bg-emerald-50 text-emerald-700` |
| `lime` | `bg-lime-50 text-lime-700` |
| `fuchsia` | `bg-fuchsia-50 text-fuchsia-700` |

With no colour, or an unknown one, there is no chip. The launcher button falls back to
`bg-white text-gray-600 hover:bg-gray-50`, the shortcut list to `text-gray-500`, and the
dashboard tile to no extra class. The launcher adds `hover:brightness-95` to a coloured chip.
Red, orange and amber are deliberately left out because they are kept for notifications.

Buttons on the right of the header, in this order:

| button | classes |
|---|---|
| secondary (Chat `forum`, Refresh, collection actions) | `h-8 px-2.5 flex items-center gap-1 rounded border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-600 font-bold text-xs transition-colors disabled:opacity-50` |
| primary Add (`add`) | `h-8 px-2.5 flex items-center gap-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors shadow-sm` |
| delete collection (`delete_forever`, icon only) | `h-8 w-8 flex items-center justify-center rounded border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 transition-colors` |
| dropdown panel | `absolute right-0 top-full mt-1 z-20 min-w-max rounded border border-slate-200 bg-white shadow-lg py-1` |
| dropdown item | `w-full h-8 px-3 flex items-center gap-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors` |

Button icons are `text-sm`. A running action swaps its icon for
`<span class="material-symbols-outlined text-sm animate-spin">progress_activity</span>`. Add
is hidden while the calendar view is active, because records are created from the day view
there.

## Toolbar

```
bar:          px-6 py-3 bg-white border-b border-slate-100 flex items-center justify-between gap-4
search wrap:  relative flex-1 max-w-md
search icon:  absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none   (icon search, text-lg)
search input: w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-9 pr-8 py-1.5 text-xs placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all font-medium
clear button: absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600   (icon close, text-sm)
right group:  flex items-center gap-2
view group:   flex gap-0.5   (role="group")
view button:  h-8 px-2.5 flex items-center gap-1 rounded text-xs font-bold transition-colors
  active:     bg-indigo-600 text-white
  inactive:   bg-white text-slate-500 border border-slate-200 hover:bg-slate-50
icon button:  h-8 w-8 flex items-center justify-center rounded bg-white text-slate-500 border border-slate-200 hover:bg-slate-50
field select: h-8 px-2 rounded border border-slate-200 bg-white text-xs font-semibold text-slate-600 focus:outline-none focus:border-indigo-500 cursor-pointer
count:        text-[10px] text-slate-400 font-bold uppercase tracking-wider select-none   ("3 / 120")
```

View buttons carry an icon (`text-sm`) and a label: `table_rows` List, `view_kanban` Kanban,
`calendar_month` Calendar. Show Calendar only when the schema has a date field and Kanban only
when it has an enum field. Show the field select only when there are two or more candidate
fields.

Filter pill (tri-state filters over boolean and flag fields):
`h-8 px-2.5 flex items-center gap-1 rounded-full text-xs font-medium transition-colors`, active
`bg-indigo-50 text-indigo-700 border border-indigo-300`, idle
`bg-transparent text-slate-500 border border-dashed border-slate-300 hover:bg-slate-50`, count
badge `min-w-4 h-4 px-1 flex items-center justify-center rounded-full bg-indigo-600 text-white text-[10px] font-bold`.
Its panel uses the dropdown classes above with `left-0` in place of `right-0`.

## List (table)

```
table:     min-w-full text-xs
head row:  bg-slate-50 border-b border-slate-200
th:        px-5 py-3 font-bold text-slate-500 text-left uppercase tracking-wider whitespace-nowrap
th inner:  flex items-center gap-1; label truncate max-w-[14rem]
sort btn:  inline-flex items-center justify-center rounded p-0.5 -my-1 leading-none transition-colors
           + text-slate-600 while sorted, text-slate-300 when not; icon arrow_upward / arrow_downward, text-base align-middle
tbody:     divide-y divide-slate-100 bg-white
tr:        hover:bg-slate-50/70 cursor-pointer transition-colors focus:outline-none focus:bg-indigo-50/30
  open/selected row adds: bg-indigo-50/40
td:        px-5 py-2 text-slate-700 align-middle max-w-xs font-medium
```

A row is `role="button" tabindex="0"` and opens the record modal on click, Enter or Space.
The `displayField` column gets no special cell. It renders as plain text like any other
column, and becomes the title of the record panel and the label of kanban cards.

Cell contents by field type:

| type | element and classes |
|---|---|
| text, number, date (default) | `block truncate text-slate-600` |
| enum | inline `<select class="rounded-lg border px-2 py-0.5 text-[11px] font-semibold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">` plus the value's `badge` + `border` classes (see Enum values) |
| boolean, toggle | checkbox `h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer align-middle disabled:opacity-50 disabled:cursor-not-allowed` |
| flag | icon `text-lg align-middle`, `check_circle` `text-emerald-600` or `radio_button_unchecked` `text-slate-300` |
| ref | `text-indigo-600 hover:text-indigo-800 hover:underline font-semibold` inside `block truncate` |
| URL, file | `block truncate text-blue-600 hover:text-blue-800 hover:underline font-semibold` |
| money | `block truncate tabular-nums font-semibold text-slate-900` |
| derived, rollup | `inline-block truncate tabular-nums font-bold text-indigo-900 bg-indigo-50/50 px-1.5 py-0.5 rounded border border-indigo-100/50` |
| table (sub-rows) | `inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200/40`, icon `list` `text-[11px]` |

An inline control stops click propagation so that it does not also open the row.

## Enum values

Value `i` of an enum's declared `values` gets palette entry `i % 8`. An empty or undeclared
value is neutral. Each entry has four strings: `badge` for pills, chips and inline selects
(always paired with `border`), `dot` for kanban column headers, and `card` for stat cards.

| i | badge | border | dot | card |
|---|---|---|---|---|
| 0 | `bg-indigo-100 text-indigo-700` | `border-indigo-200` | `bg-indigo-500` | `border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100` |
| 1 | `bg-sky-100 text-sky-700` | `border-sky-200` | `bg-sky-500` | `border-sky-200 bg-sky-50 text-sky-600 hover:bg-sky-100` |
| 2 | `bg-cyan-100 text-cyan-700` | `border-cyan-200` | `bg-cyan-500` | `border-cyan-200 bg-cyan-50 text-cyan-600 hover:bg-cyan-100` |
| 3 | `bg-teal-100 text-teal-700` | `border-teal-200` | `bg-teal-500` | `border-teal-200 bg-teal-50 text-teal-600 hover:bg-teal-100` |
| 4 | `bg-emerald-100 text-emerald-700` | `border-emerald-200` | `bg-emerald-500` | `border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100` |
| 5 | `bg-lime-100 text-lime-700` | `border-lime-200` | `bg-lime-500` | `border-lime-200 bg-lime-50 text-lime-600 hover:bg-lime-100` |
| 6 | `bg-violet-100 text-violet-700` | `border-violet-200` | `bg-violet-500` | `border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100` |
| 7 | `bg-fuchsia-100 text-fuchsia-700` | `border-fuchsia-200` | `bg-fuchsia-500` | `border-fuchsia-200 bg-fuchsia-50 text-fuchsia-600 hover:bg-fuchsia-100` |
| neutral | `bg-slate-100 text-slate-500` | `border-slate-200` | `bg-slate-300` | `border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100` |
| alert (red) | `bg-red-100 text-red-700` | `border-red-200` | `bg-red-500` | `border-red-200 bg-red-50 text-red-600 hover:bg-red-100` |
| nudge (amber) | `bg-amber-100 text-amber-700` | `border-amber-200` | `bg-amber-500` | `border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100` |

How a colour is chosen:

1. If the schema's `notifyWhen.field` is this field, the field is the notification enum. The
   first value listed in `notifyWhen.in` gets alert, any later listed value gets nudge, and every
   other value is neutral. The palette is not used.
2. Otherwise `index = values.indexOf(value)`. If the index is below zero the value is neutral,
   else it gets `PALETTE[index % 8]`.

Keep the palette as a `const` array of these literal objects, and index into it.

## Kanban

```
scroller:  h-full overflow-x-auto overflow-y-hidden
row:       flex gap-3 h-full p-1 min-w-max
column:    w-72 shrink-0 flex flex-col bg-slate-100 rounded-lg
col head:  flex items-center justify-between px-3 py-2 border-b border-slate-200
  left:    flex items-center gap-2 min-w-0
  dot:     w-2 h-2 rounded-full shrink-0 + <enum dot class>
  label:   font-semibold text-xs text-slate-600 truncate
  count:   text-[11px] text-slate-400 shrink-0
card list: flex-1 overflow-y-auto p-2 space-y-2 min-h-[2rem]
card:      bg-white border border-slate-200 rounded shadow-sm p-2 cursor-grab hover:shadow active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400
  selected adds: ring-2 ring-indigo-500 border-indigo-300
  notified adds: border-l-4 border-l-red-500 (urgent) / border-l-4 border-l-amber-500 (nudge) / border-l-4 border-l-slate-400 (info)
card body: flex items-start gap-2; label text-sm font-medium text-slate-800 truncate
card box:  mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer shrink-0
```

Columns follow the enum's declared `values` order, with an Uncategorized column (neutral dot)
for empty values. Dragging a card to another column writes the grouping field. The plugin uses
`vuedraggable` with `:animation="150"`. A card's label is its `displayField` value, or the
primary key when there is none.

## Calendar (month)

```
root:      flex flex-col gap-3
nav row:   flex items-center gap-2
prev/next: h-8 w-8 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 transition-colors   (chevron_left / chevron_right, text-lg)
month:     h3 text-sm font-bold text-slate-800 flex-1
Today:     h-8 px-2.5 flex items-center gap-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold transition-colors
weekdays:  grid grid-cols-7 gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none; each px-1 py-1 text-center
grid:      grid grid-cols-7 gap-1
day cell:  min-h-[5.5rem] rounded-lg border p-1 flex flex-col gap-1 overflow-hidden transition-colors cursor-pointer hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30
  in month:      bg-white border-slate-200
  outside month: bg-slate-50/50 border-slate-100
day number: wrapper flex items-center justify-end; span text-[11px] font-bold h-5 min-w-5 px-1 inline-flex items-center justify-center rounded-full
  today: bg-indigo-600 text-white | in month: text-slate-500 | outside: text-slate-300
event chip: text-left text-[11px] leading-tight font-semibold truncate rounded px-1.5 py-0.5 border transition-colors
  selected:  bg-indigo-600 text-white border-indigo-600
  coloured:  <enum badge> <enum border> hover:brightness-95
  default:   bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100
no-date tray: flex flex-wrap items-center gap-1.5 pt-1; label text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1
  tray chip: text-[11px] font-semibold truncate rounded px-1.5 py-0.5 border transition-colors, default bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100
```

When the schema also has an enum, chips are coloured by the kanban grouping field. Clicking a
day opens the day view, and clicking a chip selects that record.

## Day view (modal)

```
overlay:  fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4
dialog:   flex max-h-[85vh] w-full flex-row rounded-2xl bg-white shadow-xl focus:outline-none + (max-w-4xl with a record open | max-w-md)
timeline column: flex min-h-0 flex-col + (w-80 shrink-0 border-r border-slate-200 with a record open | w-full)
head:     flex items-center gap-2 border-b border-slate-200 px-4 py-3; title h3 flex-1 text-sm font-bold text-slate-800
head btn: h-8 w-8 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 transition-colors   (add, close)
empty:    px-4 py-10 text-center text-sm text-slate-400
scroll:   flex-1 overflow-y-auto px-2 py-2; timeline relative, height 24 x 48px
hour line: absolute left-0 right-0 border-t border-slate-100; label absolute -top-2 left-0 w-10 pr-1 text-right text-[10px] tabular-nums text-slate-400
events lane: absolute inset-y-0 right-0, style="left: 2.75rem"
timed chip: absolute overflow-hidden rounded border px-1.5 py-0.5 text-left transition-colors
  default bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100; selected bg-indigo-600 text-white border-indigo-600 z-10; coloured as month chips
  title block truncate text-[11px] font-semibold leading-tight; secondary block truncate text-[10px] leading-tight opacity-70
all-day row: flex flex-wrap items-center gap-1.5 border-t border-slate-200 px-4 py-2; chip truncate rounded border px-1.5 py-0.5 text-[11px] font-semibold transition-colors (default bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100)
detail pane: min-w-0 flex-1 overflow-y-auto   (holds the record panel)
```

## Record modal and panel

```
overlay: fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4   (backdrop click and Escape close it)
dialog:  flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl focus:outline-none   (role="dialog" aria-modal="true", focus trapped)
panel:   px-6 py-5 max-h-[60vh] overflow-y-auto   (a <form> while editing, a <div> while viewing)
head:    flex items-center gap-2 mb-4
  eyebrow: block text-[9px] font-bold text-slate-400 uppercase tracking-wider   (collection title)
  title:   h2 text-base font-bold text-slate-800 truncate   (displayField value)
field grid: grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 bg-white rounded-2xl border border-slate-200/60 p-6 shadow-sm
field cell: flex flex-col gap-1.5 + col-span-full (table, markdown, embed, backlinks, image) or col-span-1
label:   text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1
required mark: <span class="text-rose-500 font-bold">*</span>   (edit mode only)
value:   text-xs font-medium text-slate-700 break-words; plain value text-slate-800 font-semibold
```

Viewing and editing use the same layout. Only the control inside each cell changes.

Buttons in the header, by mode:

| button | classes |
|---|---|
| Cancel (edit) | `h-8 px-2.5 rounded text-xs font-bold text-slate-500 hover:bg-slate-200/50 transition-colors` |
| Save (edit, `type="submit"`, label "Saving..." while busy) | `h-8 px-2.5 rounded bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm shadow-indigo-600/10` |
| record action (view) | `h-8 px-2.5 rounded border border-indigo-200 bg-indigo-50/50 text-indigo-600 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 font-bold text-xs transition-all flex items-center gap-1 disabled:opacity-50` |
| Edit (`edit`) | `h-8 px-2.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-bold text-xs transition-all flex items-center gap-1` |
| Remove (`delete`) | `h-8 px-2.5 rounded border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 font-bold text-xs transition-all flex items-center gap-1` |
| Close (`close`, text-lg) | `h-8 w-8 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors` |

The view-mode buttons sit in `flex items-center gap-2`.

Form controls:

| control | classes |
|---|---|
| text, number, date, email input | `w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 font-medium text-slate-700 transition-all` |
| datetime input (in `flex items-center gap-3`, with an All day checkbox) | `flex-1 min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 font-medium text-slate-700 transition-all` |
| textarea (rows 3, markdown 5) | `w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none font-medium text-slate-700 transition-all` |
| ref select | `w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-slate-50 hover:bg-slate-50/50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all cursor-pointer font-medium text-slate-700` |
| enum select | `w-full rounded-xl border px-3 py-2 text-xs focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all cursor-pointer font-medium` + the value's `badge` + `border` |
| money | wrapper `relative flex items-center`; symbol `absolute left-3 text-slate-400 font-bold text-xs select-none pr-1.5 border-r border-slate-200`; input `w-full rounded-xl border border-slate-200 pl-11 pr-3 py-2 text-xs focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none font-semibold text-slate-800 transition-all` |
| boolean | `<label class="inline-flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer select-none">`, checkbox `h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer`, text `text-xs font-semibold` + `text-indigo-600` (yes) / `text-slate-500` (no) |
| all-day checkbox | label `flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap cursor-pointer`, box `rounded border-slate-300 text-indigo-600 focus:ring-indigo-500` |

Every select starts with an empty option labelled "Select...".

Read-only displays:

| value | classes |
|---|---|
| yes pill | `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/40` with a dot `h-1.5 w-1.5 rounded-full bg-emerald-500` |
| no pill | `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-50 text-slate-400 border border-slate-200/20` |
| unset | `<span class="text-slate-300">—</span>` |
| ref link | `text-indigo-600 hover:text-indigo-800 font-bold hover:underline` |
| URL, file link | `text-blue-600 hover:text-blue-800 font-semibold hover:underline break-all` |
| money | `font-semibold text-slate-900 tabular-nums text-sm` |
| derived, rollup | `inline-block truncate tabular-nums font-bold text-indigo-900 bg-indigo-50/50 px-2 py-0.5 rounded border border-indigo-100/50` |
| markdown | `bg-slate-50 rounded-xl p-4 border border-slate-200/60 text-slate-600 text-xs whitespace-pre-wrap leading-relaxed max-h-[30vh] overflow-y-auto` |
| image | `max-h-64 max-w-full object-contain rounded-lg border border-slate-200 bg-slate-50` |
| sub-table | wrapper `border border-slate-200/80 rounded-xl overflow-hidden shadow-sm mt-1`; table `w-full text-[11px] text-slate-600 bg-white`; thead `bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider`; th `text-left px-4 py-2 font-bold`; tbody `divide-y divide-slate-100`; tr `hover:bg-slate-50/50`; td `px-4 py-2 align-middle font-medium` |

Errors: a save error inside the grid uses
`col-span-full text-xs font-semibold text-red-600 bg-red-50 border border-red-100 p-2.5 rounded-xl`.
An action error above the grid uses
`mb-3 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 p-2.5 rounded-xl shadow-sm`.
An inline save failure in the list or kanban is a banner,
`m-4 rounded-xl border border-red-200 bg-red-50/50 p-4 text-sm text-red-800 shadow-sm flex items-center gap-3`
(`m-3 mb-0` in kanban), with a dismiss button `h-8 w-8 flex items-center justify-center rounded text-red-600 hover:bg-red-100`.

## Mutate actions and their params modal

Record actions are the indigo-outlined buttons in the panel header (see above), and collection
actions are the header's secondary buttons. An action that declares `params` opens a small form
inside the same modal shell:

```
form:    flex flex-col overflow-y-auto
head:    flex items-center justify-between px-6 pt-5 pb-3
  title: h2 text-sm font-bold text-slate-800 flex items-center gap-1.5; icon wrapper text-indigo-600 (glyph text-base)
  close: h-8 w-8 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors
fields:  flex flex-col gap-4 px-6 pb-2; each flex flex-col gap-1.5
label:   text-[10px] font-bold text-slate-400 uppercase tracking-wider (+ <span class="text-rose-500 font-bold">*</span>)
inputs:  same classes as the record form (input, textarea rows 3, enum select uses the plain bg-slate-50 select)
error:   text-xs font-semibold text-red-600 bg-red-50 border border-red-100 p-2.5 rounded-xl
footer:  flex items-center justify-end gap-2 px-6 py-4
  cancel: h-8 px-3 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-bold text-xs transition-colors
  submit: h-8 px-3 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1   (label = action label; spinner while pending)
```

The params enum select is
`w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all cursor-pointer font-medium text-slate-700`.

## Minimal component skeletons

Header:

```vue
<header class="flex items-center gap-3 px-6 py-2 border-b border-slate-200 bg-white">
  <div class="h-9 w-9 flex items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
    <span class="material-symbols-outlined text-xl">{{ collection.icon }}</span>
  </div>
  <div class="flex-1 min-w-0">
    <h1 class="text-base font-bold text-slate-800 truncate">{{ collection.title }}</h1>
    <span class="block text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate">{{ collection.slug }}</span>
  </div>
  <button type="button" class="h-8 px-2.5 flex items-center gap-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors shadow-sm" @click="emit('create')">
    <span class="material-symbols-outlined text-sm">add</span><span>{{ t("add") }}</span>
  </button>
</header>
```

Toolbar:

```vue
<div class="px-6 py-3 bg-white border-b border-slate-100 flex items-center justify-between gap-4">
  <div class="relative flex-1 max-w-md">
    <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
      <span class="material-symbols-outlined text-lg">search</span>
    </span>
    <input v-model="query" type="text" class="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-9 pr-8 py-1.5 text-xs placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all font-medium" />
  </div>
  <div class="flex items-center gap-2">
    <div class="flex gap-0.5" role="group">
      <button v-for="v in views" :key="v.id" type="button" class="h-8 px-2.5 flex items-center gap-1 rounded text-xs font-bold transition-colors"
        :class="active === v.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'" @click="emit('setView', v.id)">
        <span class="material-symbols-outlined text-sm">{{ v.icon }}</span><span>{{ v.label }}</span>
      </button>
    </div>
    <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider select-none">{{ shown }} / {{ total }}</div>
  </div>
</div>
```

Table row:

```vue
<tr class="hover:bg-slate-50/70 cursor-pointer transition-colors focus:outline-none focus:bg-indigo-50/30"
  :class="item.id === openId ? 'bg-indigo-50/40' : ''" role="button" tabindex="0" @click="emit('open', item)" @keydown.enter.self="emit('open', item)">
  <td v-for="col in columns" :key="col.key" class="px-5 py-2 text-slate-700 align-middle max-w-xs font-medium">
    <span v-if="col.type === 'enum'" class="inline-flex px-2 py-0.5 rounded-lg border text-[11px] font-semibold" :class="enumPillClass(col.key, item[col.key])">{{ item[col.key] }}</span>
    <span v-else class="block truncate text-slate-600">{{ format(item[col.key]) }}</span>
  </td>
</tr>
```

`enumPillClass` returns `` `${c.badge} ${c.border}` `` from the literal table above. That
template string joins two complete literals; it does not build a class name. The plugin itself
renders list enums as the inline `<select>` described under List. Use the pill form for
read-only places.

Record modal:

```vue
<Teleport to="body">
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" @click.self="emit('close')">
    <div class="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl focus:outline-none" role="dialog" aria-modal="true" tabindex="-1" @keydown.esc="emit('close')">
      <form class="px-6 py-5 max-h-[60vh] overflow-y-auto" @submit.prevent="emit('save')">
        <div class="flex items-center gap-2 mb-4">
          <div class="flex-1 min-w-0">
            <span class="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">{{ collectionTitle }}</span>
            <h2 class="text-base font-bold text-slate-800 truncate">{{ recordTitle }}</h2>
          </div>
          <button type="button" class="h-8 px-2.5 rounded text-xs font-bold text-slate-500 hover:bg-slate-200/50 transition-colors" @click="emit('close')">{{ t("cancel") }}</button>
          <button type="submit" class="h-8 px-2.5 rounded bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm shadow-indigo-600/10" :disabled="saving">{{ t("save") }}</button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 bg-white rounded-2xl border border-slate-200/60 p-6 shadow-sm">
          <div v-for="f in fields" :key="f.key" class="flex flex-col gap-1.5">
            <label :for="f.key" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              {{ f.label }}<span v-if="f.required" class="text-rose-500 font-bold">*</span>
            </label>
            <input :id="f.key" v-model="draft[f.key]" class="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 font-medium text-slate-700 transition-all" />
          </div>
          <p v-if="error" class="col-span-full text-xs font-semibold text-red-600 bg-red-50 border border-red-100 p-2.5 rounded-xl">{{ error }}</p>
        </div>
      </form>
    </div>
  </div>
</Teleport>
```
