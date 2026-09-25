<script setup lang="ts">
import { reactive } from 'vue'
import {
  formatRational,
  isZero,
  parseRational,
  type Rational,
} from '../domain/fraction'

interface CellPosition {
  row: number
  column: number
}

const props = defineProps<{
  cells: Rational[][]
  name?: string
  editable?: boolean
  swapMode?: boolean
  selectedCell?: CellPosition | null
}>()

const emit = defineEmits<{
  commitCell: [payload: { row: number; column: number; value: Rational }]
  selectCell: [payload: CellPosition]
}>()

const drafts = reactive<Record<string, string>>({})
const errors = reactive<Record<string, string>>({})

function cellKey(row: number, column: number) {
  return `${row}:${column}`
}

function valueFor(row: number, column: number, value: Rational) {
  return drafts[cellKey(row, column)] ?? formatRational(value)
}

function startEditing(row: number, column: number, value: Rational) {
  const key = cellKey(row, column)
  drafts[key] ??= isZero(value) ? '' : formatRational(value)
  delete errors[key]
}

function updateDraft(row: number, column: number, event: Event) {
  drafts[cellKey(row, column)] = (event.target as HTMLInputElement).value
}

function commit(row: number, column: number) {
  const key = cellKey(row, column)
  const draft = drafts[key]
  if (draft === undefined) return
  if (!draft.trim()) {
    delete errors[key]
    delete drafts[key]
    return
  }

  try {
    const value = parseRational(draft)
    emit('commitCell', { row, column, value })
    delete errors[key]
    delete drafts[key]
  } catch (error) {
    errors[key] = error instanceof Error ? error.message : '输入格式不正确。'
  }
}

function clickCell(row: number, column: number) {
  if (props.editable && props.swapMode) emit('selectCell', { row, column })
}

function isSelected(row: number, column: number) {
  return (
    props.selectedCell?.row === row && props.selectedCell?.column === column
  )
}
</script>

<template>
  <div class="matrix-scroll">
    <table
      class="matrix-grid"
      :class="{ 'matrix-grid--swap': editable && swapMode }"
      :aria-label="`矩阵 ${name ?? ''}`"
    >
      <thead>
        <tr>
          <th class="axis-label" scope="col">行 / 列</th>
          <th
            v-for="column in cells[0]?.length ?? 0"
            :key="column"
            scope="col"
          >
            {{ column }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, rowIndex) in cells" :key="rowIndex">
          <th class="axis-label" scope="row">{{ rowIndex + 1 }}</th>
          <td
            v-for="(value, columnIndex) in row"
            :key="columnIndex"
            :class="{
              'matrix-cell--selected': isSelected(rowIndex, columnIndex),
              'matrix-cell--invalid': errors[cellKey(rowIndex, columnIndex)],
            }"
            @click="clickCell(rowIndex, columnIndex)"
          >
            <input
              v-if="editable && !swapMode"
              class="matrix-input"
              :value="valueFor(rowIndex, columnIndex, value)"
              :aria-label="`矩阵 ${name ?? ''} 第 ${rowIndex + 1} 行，第 ${columnIndex + 1} 列`"
              :aria-invalid="Boolean(errors[cellKey(rowIndex, columnIndex)])"
              inputmode="text"
              spellcheck="false"
              @focus="startEditing(rowIndex, columnIndex, value)"
              @input="updateDraft(rowIndex, columnIndex, $event)"
              @keydown.enter.prevent="commit(rowIndex, columnIndex)"
              @blur="commit(rowIndex, columnIndex)"
            />
            <button
              v-else-if="editable && swapMode"
              class="matrix-cell-button"
              type="button"
              :aria-label="`选择矩阵 ${name ?? ''} 第 ${rowIndex + 1} 行，第 ${columnIndex + 1} 列，当前值 ${formatRational(value)}`"
              @click.stop="clickCell(rowIndex, columnIndex)"
            >
              {{ formatRational(value) }}
            </button>
            <span v-else class="matrix-value">{{ formatRational(value) }}</span>
            <span
              v-if="errors[cellKey(rowIndex, columnIndex)]"
              class="cell-error"
              role="alert"
            >
              {{ errors[cellKey(rowIndex, columnIndex)] }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
