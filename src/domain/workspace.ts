import { reactive } from 'vue'
import {
  formatRational,
  isZero,
  parseRational,
  rational,
  type Rational,
} from './fraction'
import {
  addPolynomial,
  clonePolynomial,
  constant,
  equalPolynomial,
  scalePolynomial,
  zero,
  type Polynomial,
} from './polynomial'

export type Axis = 'row' | 'column'
export type ElementaryOperation = 'swap' | 'scale' | 'add'

export interface MatrixRecord {
  id: number
  name: string
  cells: Polynomial[][]
}

export interface MatrixStep {
  id: number
  matrices: MatrixRecord[]
  note: string
}

interface CellPosition {
  row: number
  column: number
}

type UndoAction =
  | { type: 'set-cell'; stepId: number; matrixId: number; row: number; column: number; previous: Polynomial }
  | { type: 'swap-cells'; stepId: number; matrixId: number; first: CellPosition; second: CellPosition }
  | { type: 'append-step'; stepId: number; previousActiveId: number | null }
  | { type: 'add-matrix'; stepId: number; matrixId: number }
  | { type: 'delete-matrix'; stepId: number; matrix: MatrixRecord; index: number }
  | { type: 'set-matrix-name'; stepId: number; matrixId: number; previous: string }
  | { type: 'resize-matrix'; stepId: number; previous: MatrixRecord }
  | { type: 'delete-step'; step: MatrixStep; index: number; previousActiveId: number | null }
  | { type: 'set-note'; stepId: number; previous: string }

interface WorkspaceState {
  steps: MatrixStep[]
  activeStepId: number | null
  nextStepId: number
  nextMatrixId: number
  undoStack: UndoAction[]
  revision: number
}

const STORAGE_KEY = 'matrix-scratchpad-draft-v1'

function cloneMatrix(matrix: Polynomial[][]): Polynomial[][] {
  return matrix.map((row) => row.map(clonePolynomial))
}

function cloneMatrixRecord(matrix: MatrixRecord): MatrixRecord {
  return { id: matrix.id, name: matrix.name, cells: cloneMatrix(matrix.cells) }
}

function cloneStep(step: MatrixStep): MatrixStep {
  return { id: step.id, matrices: step.matrices.map(cloneMatrixRecord), note: step.note }
}

function findStep(state: WorkspaceState, stepId: number): MatrixStep | undefined {
  return state.steps.find((step) => step.id === stepId)
}

function findMatrix(step: MatrixStep | undefined, matrixId: number): MatrixRecord | undefined {
  return step?.matrices.find((matrix) => matrix.id === matrixId)
}

function validateDimensions(rows: number, columns: number) {
  if (
    !Number.isInteger(rows) || !Number.isInteger(columns) ||
    rows < 1 || columns < 1 || rows > 10 || columns > 10
  ) {
    throw new Error('矩阵行数和列数都必须在 1 到 10 之间。')
  }
}

function makeBlankMatrix(rows: number, columns: number): Polynomial[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: columns }, zero),
  )
}

function matrixName(id: number): string {
  let value = id
  let name = ''
  while (value > 0) {
    value -= 1
    name = String.fromCharCode(65 + (value % 26)) + name
    value = Math.floor(value / 26)
  }
  return name
}

function clearLegacyDraft() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage may be unavailable; the application does not read or write drafts.
  }
}

export function createWorkspace() {
  const state = reactive<WorkspaceState>({
    steps: [],
    activeStepId: null,
    nextStepId: 1,
    nextMatrixId: 1,
    undoStack: [],
    revision: 0,
  })

  clearLegacyDraft()

  function changed() {
    state.revision += 1
  }

  function getActiveStep(): MatrixStep | undefined {
    return findStep(state, state.activeStepId ?? -1)
  }

  function setActiveStep(stepId: number) {
    if (!state.steps.some((step) => step.id === stepId)) return
    state.activeStepId = stepId
  }

  function appendStep(matrices: MatrixRecord[], note = '') {
    const previousActiveId = state.activeStepId
    const activeIndex = state.steps.findIndex((step) => step.id === previousActiveId)
    const step: MatrixStep = {
      id: state.nextStepId++,
      matrices: matrices.map(cloneMatrixRecord),
      note,
    }
    state.steps.splice(activeIndex + 1, 0, step)
    state.activeStepId = step.id
    state.undoStack.push({ type: 'append-step', stepId: step.id, previousActiveId })
    changed()
  }

  function addMatrix(cells: Polynomial[][]) {
    const id = state.nextMatrixId++
    const step = getActiveStep()
    let nameIndex = id
    while (step?.matrices.some((matrix) => matrix.name === matrixName(nameIndex))) nameIndex += 1
    const matrix = { id, name: matrixName(nameIndex), cells }
    if (!step) {
      appendStep([matrix], '初始矩阵')
      return
    }
    step.matrices.push(matrix)
    state.undoStack.push({ type: 'add-matrix', stepId: step.id, matrixId: id })
    changed()
  }

  function createMatrix(rows: number, columns: number, kind: 'zero' | 'identity' = 'zero') {
    validateDimensions(rows, columns)
    if (kind === 'identity' && rows !== columns) throw new Error('单位矩阵必须是方阵，请将行数和列数设为相同值。')
    const cells = makeBlankMatrix(rows, columns)
    if (kind === 'identity') {
      for (let index = 0; index < rows; index += 1) cells[index][index] = constant(rational(1n))
    }
    addMatrix(cells)
  }

  function copyMatrix(sourceMatrixId: number) {
    const source = findMatrix(getActiveStep(), sourceMatrixId)
    if (!source) throw new Error('请从当前步骤选择要复制的矩阵。')
    addMatrix(cloneMatrix(source.cells))
  }

  function addNextStep() {
    const active = getActiveStep()
    if (!active) return
    appendStep(active.matrices, '')
  }

  function resizeMatrix(stepId: number, matrixId: number, axis: Axis, direction: 'add' | 'remove') {
    const step = findStep(state, stepId)
    const matrix = findMatrix(step, matrixId)
    if (!step || !matrix) return
    const size = axis === 'row' ? matrix.cells.length : (matrix.cells[0]?.length ?? 0)
    if (direction === 'add' && size >= 10) throw new Error('矩阵行数和列数最多为 10。')
    if (direction === 'remove' && size <= 1) throw new Error('矩阵至少要保留 1 行或 1 列。')

    const previous = cloneMatrixRecord(matrix)
    if (axis === 'row') {
      if (direction === 'add') matrix.cells.push(Array.from({ length: matrix.cells[0].length }, zero))
      else matrix.cells.pop()
    } else {
      for (const row of matrix.cells) {
        if (direction === 'add') row.push(zero())
        else row.pop()
      }
    }
    state.undoStack.push({ type: 'resize-matrix', stepId, previous })
    changed()
  }

  function deleteMatrix(stepId: number, matrixId: number) {
    const step = findStep(state, stepId)
    if (!step) return
    const index = step.matrices.findIndex((matrix) => matrix.id === matrixId)
    if (index < 0) return
    const [matrix] = step.matrices.splice(index, 1)
    state.undoStack.push({ type: 'delete-matrix', stepId, matrix: cloneMatrixRecord(matrix), index })
    changed()
  }

  function setMatrixName(stepId: number, matrixId: number, requestedName: string) {
    const step = findStep(state, stepId)
    const matrix = findMatrix(step, matrixId)
    if (!step || !matrix) return
    const name = requestedName.trim()
    if (!name) throw new Error('矩阵名称不能为空。')
    if (name.length > 20) throw new Error('矩阵名称最多 20 个字符。')
    if (step.matrices.some((item) => item.id !== matrixId && item.name === name)) {
      throw new Error('当前步骤中已有同名矩阵。')
    }
    if (name === matrix.name) return
    state.undoStack.push({ type: 'set-matrix-name', stepId, matrixId, previous: matrix.name })
    matrix.name = name
    changed()
  }

  function setCell(stepId: number, matrixId: number, row: number, column: number, value: Polynomial) {
    const matrix = findMatrix(findStep(state, stepId), matrixId)
    const previous = matrix?.cells[row]?.[column]
    if (!matrix || !previous) return
    if (equalPolynomial(previous, value)) return

    state.undoStack.push({ type: 'set-cell', stepId, matrixId, row, column, previous })
    matrix.cells[row][column] = clonePolynomial(value)
    changed()
  }

  function swapCells(stepId: number, matrixId: number, first: CellPosition, second: CellPosition) {
    const matrix = findMatrix(findStep(state, stepId), matrixId)
    if (!matrix || (first.row === second.row && first.column === second.column)) return
    const firstValue = matrix.cells[first.row]?.[first.column]
    const secondValue = matrix.cells[second.row]?.[second.column]
    if (!firstValue || !secondValue) return

    state.undoStack.push({ type: 'swap-cells', stepId, matrixId, first: { ...first }, second: { ...second } })
    matrix.cells[first.row][first.column] = secondValue
    matrix.cells[second.row][second.column] = firstValue
    changed()
  }

  function transpose(matrixId: number) {
    const active = getActiveStep()
    const target = findMatrix(active, matrixId)
    if (!active || !target) return
    const rows = target.cells.length
    const columns = target.cells[0]?.length ?? 0
    const matrices = active.matrices.map((matrix) => matrix.id === matrixId
      ? { ...matrix, cells: Array.from({ length: columns }, (_, column) =>
          Array.from({ length: rows }, (_, row) => target.cells[row][column]),
        ) }
      : matrix)
    appendStep(matrices, `${target.name} 转置`)
  }

  function applyElementary(
    matrixId: number,
    axis: Axis,
    operation: ElementaryOperation,
    target: number,
    source: number,
    coefficient: Rational,
  ) {
    const active = getActiveStep()
    const selected = findMatrix(active, matrixId)
    if (!active || !selected) return

    const cells = cloneMatrix(selected.cells)
    const size = axis === 'row' ? selected.cells.length : (selected.cells[0]?.length ?? 0)
    const axisName = axis === 'row' ? '行' : '列'
    const symbol = axis === 'row' ? 'R' : 'C'
    const indexOf = (index: number) => index + 1

    if (!Number.isInteger(target) || target < 0 || target >= size ||
      !Number.isInteger(source) || source < 0 || source >= size) {
      throw new Error(`请选择有效的${axisName}号。`)
    }

    if (operation === 'swap' && target === source) throw new Error('请选择两个不同的行或列。')
    if (operation === 'scale' && isZero(coefficient)) throw new Error('倍乘系数不能为 0。')
    if (operation === 'add' && target === source) throw new Error('源行/列与目标行/列不能相同。')

    const coefficientLabel = formatRational(coefficient)
    if (operation === 'swap') {
      if (axis === 'row') [cells[target], cells[source]] = [cells[source], cells[target]]
      else for (const row of cells) [row[target], row[source]] = [row[source], row[target]]
    } else if (operation === 'scale') {
      if (axis === 'row') cells[target] = cells[target].map((value) => scalePolynomial(value, coefficient))
      else for (const row of cells) row[target] = scalePolynomial(row[target], coefficient)
    } else if (axis === 'row') {
      cells[target] = cells[target].map((value, column) => addPolynomial(value, scalePolynomial(cells[source][column], coefficient)))
    } else {
      for (const row of cells) row[target] = addPolynomial(row[target], scalePolynomial(row[source], coefficient))
    }

    const operationText = operation === 'swap'
      ? `${symbol}${indexOf(target)} ↔ ${symbol}${indexOf(source)}`
      : operation === 'scale'
        ? `${symbol}${indexOf(target)} ← (${coefficientLabel})${symbol}${indexOf(target)}`
        : `${symbol}${indexOf(target)} ← ${symbol}${indexOf(target)} + (${coefficientLabel})${symbol}${indexOf(source)}`
    appendStep(active.matrices.map((matrix) => matrix.id === matrixId ? { ...matrix, cells } : matrix), `${selected.name}: ${operationText}`)
  }

  function setNote(stepId: number, note: string) {
    const step = findStep(state, stepId)
    if (!step || step.note === note) return
    state.undoStack.push({ type: 'set-note', stepId, previous: step.note })
    step.note = note
    changed()
  }

  function deleteStep(stepId: number) {
    const index = state.steps.findIndex((step) => step.id === stepId)
    if (index < 0) return
    const previousActiveId = state.activeStepId
    const [removed] = state.steps.splice(index, 1)
    state.undoStack.push({ type: 'delete-step', step: cloneStep(removed), index, previousActiveId })
    if (previousActiveId === stepId) {
      state.activeStepId = state.steps[Math.min(index, state.steps.length - 1)]?.id ?? null
    }
    changed()
  }

  function undo() {
    const action = state.undoStack.pop()
    if (!action) return
    switch (action.type) {
      case 'set-cell': {
        const matrix = findMatrix(findStep(state, action.stepId), action.matrixId)
        if (matrix) matrix.cells[action.row][action.column] = clonePolynomial(action.previous)
        break
      }
      case 'swap-cells': {
        const matrix = findMatrix(findStep(state, action.stepId), action.matrixId)
        if (matrix) {
          const first = matrix.cells[action.first.row][action.first.column]
          matrix.cells[action.first.row][action.first.column] = matrix.cells[action.second.row][action.second.column]
          matrix.cells[action.second.row][action.second.column] = first
        }
        break
      }
      case 'append-step': {
        const index = state.steps.findIndex((step) => step.id === action.stepId)
        if (index >= 0) state.steps.splice(index, 1)
        state.activeStepId = state.steps.some((step) => step.id === action.previousActiveId)
          ? action.previousActiveId : (state.steps.at(-1)?.id ?? null)
        break
      }
      case 'add-matrix': {
        const step = findStep(state, action.stepId)
        if (step) step.matrices = step.matrices.filter((matrix) => matrix.id !== action.matrixId)
        break
      }
      case 'delete-matrix': {
        const step = findStep(state, action.stepId)
        if (step) step.matrices.splice(action.index, 0, cloneMatrixRecord(action.matrix))
        break
      }
      case 'set-matrix-name': {
        const matrix = findMatrix(findStep(state, action.stepId), action.matrixId)
        if (matrix) matrix.name = action.previous
        break
      }
      case 'resize-matrix': {
        const step = findStep(state, action.stepId)
        if (step) {
          const index = step.matrices.findIndex((matrix) => matrix.id === action.previous.id)
          if (index >= 0) step.matrices[index] = cloneMatrixRecord(action.previous)
        }
        break
      }
      case 'delete-step':
        state.steps.splice(action.index, 0, cloneStep(action.step))
        state.activeStepId = state.steps.some((step) => step.id === action.previousActiveId)
          ? action.previousActiveId : action.step.id
        break
      case 'set-note': {
        const step = findStep(state, action.stepId)
        if (step) step.note = action.previous
        break
      }
    }
    changed()
  }

  return {
    state,
    getActiveStep,
    setActiveStep,
    createMatrix,
    copyMatrix,
    addNextStep,
    resizeMatrix,
    deleteMatrix,
    setMatrixName,
    setCell,
    swapCells,
    transpose,
    applyElementary,
    setNote,
    deleteStep,
    undo,
    parseRational,
  }
}
