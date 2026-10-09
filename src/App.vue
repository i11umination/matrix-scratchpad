<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import MatrixGrid from './components/MatrixGrid.vue'
import { isZeroPolynomial, parsePolynomial, zero } from './domain/polynomial'
import {
  createWorkspace,
  type Axis,
  type ElementaryOperation,
  type MatrixRecord,
  type MatrixStep,
} from './domain/workspace'

const workspace = createWorkspace()
const { state } = workspace

const activeStep = computed(() => workspace.getActiveStep())
const activeIndex = computed(() => state.steps.findIndex((step) => step.id === state.activeStepId))
const comparisonSteps = computed(() => {
  const index = activeIndex.value
  const current = activeStep.value
  if (!current) return [] as Array<{ step: MatrixStep; editable: boolean }>
  if (index > 0) return [
    { step: state.steps[index - 1], editable: false },
    { step: current, editable: true },
  ]
  if (index >= 0 && index + 1 < state.steps.length) return [
    { step: current, editable: true },
    { step: state.steps[index + 1], editable: false },
  ]
  return [{ step: current, editable: true }]
})

const rows = ref(3)
const columns = ref(3)
const noteDraft = ref('')
const notice = ref('')
const noticeIsError = ref(false)
const swapMode = ref(false)
const selectedCell = ref<{ matrixId: number; row: number; column: number } | null>(null)
const selectedMatrixId = ref<number | null>(null)
const copySourceMatrixId = ref<number | null>(null)

const transformAxis = ref<Axis>('row')
const transformKind = ref<ElementaryOperation>('swap')
const targetIndex = ref(1)
const sourceIndex = ref(2)
const coefficientInput = ref('2')
const operationError = ref('')

const activeMatrix = computed(() => {
  const matrices = activeStep.value?.matrices ?? []
  return matrices.find((matrix) => matrix.id === selectedMatrixId.value) ?? matrices[0]
})
const axisSize = computed(() => {
  if (!activeMatrix.value) return 1
  return transformAxis.value === 'row'
    ? activeMatrix.value.cells.length
    : (activeMatrix.value.cells[0]?.length ?? 1)
})
const axisChoices = computed(() => Array.from({ length: axisSize.value }, (_, index) => index + 1))

watch(
  () => [activeStep.value?.id, activeStep.value?.note] as const,
  ([, note]) => { noteDraft.value = note ?? '' },
  { immediate: true },
)

watch(
  () => activeStep.value?.matrices.map((matrix) => matrix.id).join(',') ?? '',
  () => {
    if (!activeStep.value?.matrices.some((matrix) => matrix.id === selectedMatrixId.value)) {
      selectedMatrixId.value = activeStep.value?.matrices[0]?.id ?? null
    }
    if (!activeStep.value?.matrices.some((matrix) => matrix.id === copySourceMatrixId.value)) {
      copySourceMatrixId.value = activeStep.value?.matrices[0]?.id ?? null
    }
    swapMode.value = false
    selectedCell.value = null
  },
  { immediate: true },
)

watch(
  () => [selectedMatrixId.value, transformAxis.value, transformKind.value] as const,
  () => {
    targetIndex.value = transformKind.value === 'add' ? Math.min(2, axisSize.value) : 1
    sourceIndex.value = transformKind.value === 'add' ? 1 : Math.min(2, axisSize.value)
    operationError.value = ''
  },
)

watch(axisSize, (size) => {
  targetIndex.value = Math.min(targetIndex.value, size)
  sourceIndex.value = Math.min(sourceIndex.value, size)
})

function reportError(error: unknown) {
  noticeIsError.value = true
  notice.value = error instanceof Error ? error.message : '操作失败，请检查输入。'
}

function reportSuccess(message: string) {
  noticeIsError.value = false
  notice.value = message
}

function createMatrix(kind: 'zero' | 'identity' = 'zero') {
  try {
    workspace.createMatrix(Number(rows.value), Number(columns.value), kind)
    selectedMatrixId.value = activeStep.value?.matrices.at(-1)?.id ?? null
    reportSuccess(`${kind === 'identity' ? '单位矩阵' : '新矩阵'} ${activeMatrix.value?.name} 已${activeStep.value?.matrices.length === 1 ? '创建' : '添加到当前步骤'}。`)
  } catch (error) {
    reportError(error)
  }
}

function copyMatrix() {
  if (copySourceMatrixId.value === null) return
  const source = activeStep.value?.matrices.find((matrix) => matrix.id === copySourceMatrixId.value)
  if (!source) return
  try {
    workspace.copyMatrix(source.id)
    selectedMatrixId.value = activeStep.value?.matrices.at(-1)?.id ?? null
    reportSuccess(`已将矩阵 ${source.name} 复制为 ${activeMatrix.value?.name}，可分别编辑。`)
  } catch (error) {
    reportError(error)
  }
}

function addNextStep() {
  if (!activeStep.value) return
  workspace.addNextStep()
  reportSuccess('已创建下一步，所有矩阵都已复制。')
}

function commitNote() {
  if (activeStep.value) workspace.setNote(activeStep.value.id, noteDraft.value)
}

function toggleSwapMode() {
  swapMode.value = !swapMode.value
  selectedCell.value = null
  reportSuccess(swapMode.value ? `依次选择矩阵 ${activeMatrix.value?.name} 中的两个单元格。` : '已退出单元格交换。')
}

function chooseCell(matrixId: number, position: { row: number; column: number }) {
  if (!activeStep.value) return
  if (!selectedCell.value || selectedCell.value.matrixId !== matrixId) {
    selectedCell.value = { matrixId, ...position }
    return
  }
  workspace.swapCells(activeStep.value.id, matrixId, selectedCell.value, position)
  selectedCell.value = null
  reportSuccess('单元格内容已交换。')
}

function selectMatrix(matrix: MatrixRecord) {
  selectedMatrixId.value = matrix.id
  selectedCell.value = null
  operationError.value = ''
}

function resizeMatrix(matrix: MatrixRecord, axis: Axis, direction: 'add' | 'remove') {
  if (!activeStep.value) return
  try {
    workspace.resizeMatrix(activeStep.value.id, matrix.id, axis, direction)
    reportSuccess(`${matrix.name} 已${direction === 'add' ? '增加' : '删除'}${axis === 'row' ? '一行' : '一列'}。`)
  } catch (error) {
    reportError(error)
  }
}

function deleteMatrix(matrix: MatrixRecord) {
  if (!activeStep.value) return
  workspace.deleteMatrix(activeStep.value.id, matrix.id)
  if (selectedMatrixId.value === matrix.id) {
    selectedMatrixId.value = activeStep.value.matrices[0]?.id ?? null
  }
  selectedCell.value = null
  reportSuccess(`矩阵 ${matrix.name} 已从当前步骤删除；可以撤销恢复。`)
}

function commitMatrixName(matrix: MatrixRecord, event: FocusEvent) {
  if (!activeStep.value) return
  const input = event.target as HTMLInputElement
  const previous = matrix.name
  try {
    workspace.setMatrixName(activeStep.value.id, matrix.id, input.value)
    input.value = matrix.name
    if (matrix.name !== previous) reportSuccess(`矩阵已命名为 ${matrix.name}；可以撤销恢复。`)
  } catch (error) {
    input.value = matrix.name
    reportError(error)
  }
}

function selectNameText(event: FocusEvent) {
  (event.target as HTMLInputElement).select()
}

function finishNameEditing(event: KeyboardEvent) {
  (event.target as HTMLInputElement).blur()
}

function cancelNameEditing(matrix: MatrixRecord, event: KeyboardEvent) {
  const input = event.target as HTMLInputElement
  input.value = matrix.name
  input.blur()
}

function transpose() {
  if (!activeMatrix.value) return
  workspace.transpose(activeMatrix.value.id)
  reportSuccess(`矩阵 ${activeMatrix.value.name} 的转置结果已添加为新步骤。`)
}

function applyTransform() {
  if (!activeMatrix.value) return
  operationError.value = ''
  try {
    const coefficient = transformKind.value === 'swap' ? zero() : parsePolynomial(coefficientInput.value)
    if (transformKind.value === 'scale' && isZeroPolynomial(coefficient)) throw new Error('倍乘系数不能为 0。')
    const targetName = activeMatrix.value.name
    workspace.applyElementary(
      activeMatrix.value.id,
      transformAxis.value,
      transformKind.value,
      targetIndex.value - 1,
      sourceIndex.value - 1,
      coefficient,
    )
    reportSuccess(`矩阵 ${targetName} 的变换结果已添加为新步骤。`)
  } catch (error) {
    operationError.value = error instanceof Error ? error.message : '变换失败，请检查输入。'
  }
}

function undo() {
  if (!state.undoStack.length) return
  workspace.undo()
  reportSuccess('已撤销上一步操作。')
}

function deleteActiveStep() {
  if (!activeStep.value) return
  workspace.deleteStep(activeStep.value.id)
  reportSuccess(state.steps.length ? '步骤已删除；如需恢复，可以点击撤销。' : '最后一步已删除，可以重新创建矩阵。')
}

function selectStep(stepId: number) {
  workspace.setActiveStep(stepId)
}

function matrixSummary(step: MatrixStep) {
  return step.matrices.length
    ? step.matrices.map((matrix) => `${matrix.name} ${matrix.cells.length}×${matrix.cells[0]?.length ?? 0}`).join(' · ')
    : '暂无矩阵'
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
        <div><p class="eyebrow">LINEAR ALGEBRA · WORKSPACE</p><h1>矩阵草稿台</h1></div>
      </div>
      <div class="save-state save-state--temporary">
        <span class="save-dot"></span>仅保存在当前页面 · 刷新后清空
      </div>
    </header>

    <main class="workspace-layout">
      <aside class="steps-sidebar">
        <div class="sidebar-heading">
          <div><p class="eyebrow">YOUR WORK</p><h2>演算步骤</h2></div>
          <span class="step-count">{{ state.steps.length }} 步</span>
        </div>
        <div v-if="state.steps.length" class="step-list">
          <button v-for="(step, index) in state.steps" :key="step.id" class="step-nav-item"
            :class="{ 'step-nav-item--active': step.id === state.activeStepId }" type="button" @click="selectStep(step.id)">
            <span class="step-index">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="step-nav-copy"><strong>步骤 {{ index + 1 }}</strong><span>{{ step.note || matrixSummary(step) }}</span></span>
            <span v-if="step.id === state.activeStepId" class="active-indicator"></span>
          </button>
        </div>
        <div v-else class="sidebar-empty"><span class="empty-spark" aria-hidden="true">✳</span><p>创建矩阵后<br />演算步骤会显示在这里</p></div>
        <button v-if="activeStep && activeStep.matrices.length" class="sidebar-add" type="button" @click="addNextStep"><span aria-hidden="true">＋</span> 新建下一步</button>
        <div class="sidebar-tip"><span class="tip-icon" aria-hidden="true">↗</span><p>每一步都保存整组矩阵，方便回看和比较。</p></div>
      </aside>

      <section class="main-panel">
        <div class="create-card create-card--multi">
          <div class="create-card-icon" aria-hidden="true"><span class="mini-matrix"><i></i><i></i><i></i><i></i></span></div>
          <div class="create-copy"><p class="eyebrow">{{ activeStep ? 'ADD MATRIX' : 'NEW MATRIX' }}</p><h3>{{ activeStep ? '添加另一张矩阵' : '设置矩阵大小' }}</h3>
            <p>按行列数创建新矩阵或单位矩阵；新矩阵默认填 0，单位矩阵须为方阵。单元格可输入 x、2x+y、x² 等表达式。</p></div>
          <div class="create-controls">
            <form class="dimension-form" @submit.prevent="createMatrix('zero')">
              <label><span>行数</span><input v-model.number="rows" type="number" min="1" max="10" /></label>
              <span class="dimension-by" aria-hidden="true">×</span>
              <label><span>列数</span><input v-model.number="columns" type="number" min="1" max="10" /></label>
              <button class="button button--primary" type="submit">创建新矩阵 <span aria-hidden="true">→</span></button>
              <button class="button button--quiet" type="button" @click="createMatrix('identity')">创建单位矩阵</button>
            </form>
            <div v-if="activeStep?.matrices.length" class="copy-matrix-controls">
              <label for="copy-source-matrix">复制当前步骤的矩阵</label>
              <select id="copy-source-matrix" v-model.number="copySourceMatrixId">
                <option v-for="matrix in activeStep.matrices" :key="matrix.id" :value="matrix.id">{{ matrix.name }}（{{ matrix.cells.length }}×{{ matrix.cells[0]?.length ?? 0 }}）</option>
              </select>
              <button class="button button--quiet" type="button" @click="copyMatrix">复制矩阵</button>
            </div>
          </div>
        </div>

        <section v-if="!activeStep && state.undoStack.length" class="comparison-section" aria-labelledby="empty-comparison-title">
          <div class="section-heading">
            <div><p class="eyebrow">STEP COMPARISON</p><h3 id="empty-comparison-title">演算过程</h3></div>
            <button class="button button--quiet" type="button" @click="undo"><span aria-hidden="true">↶</span> 撤销最近操作</button>
          </div>
          <p class="empty-matrices empty-matrices--inside">当前没有步骤；可以撤销最近操作。</p>
        </section>

        <template v-if="activeStep">
          <div v-if="!activeStep.matrices.length" class="empty-matrices"><strong>当前步骤没有矩阵</strong><span>添加一张矩阵即可继续演算。</span><button class="matrix-delete-button" type="button" @click="deleteActiveStep">删除此步</button></div>
          <div v-if="activeStep.matrices.length" class="toolbar-card">
            <div class="toolbar-label"><span class="toolbar-icon" aria-hidden="true">⌘</span><div><strong>矩阵操作</strong><span>目标矩阵：{{ activeMatrix?.name ?? '—' }}</span></div></div>
            <div class="toolbar-buttons">
              <button class="button button--tool" :class="{ 'button--tool-active': swapMode }" type="button" @click="toggleSwapMode"><span aria-hidden="true">⇄</span>{{ swapMode ? '取消交换' : '交换两个元素' }}</button>
              <button class="button button--tool" type="button" @click="transpose"><span aria-hidden="true">↻</span> 转置 {{ activeMatrix?.name }}</button>
              <button class="button button--tool button--danger-quiet" type="button" @click="deleteActiveStep"><span aria-hidden="true">⌫</span> 删除此步</button>
            </div>
          </div>

          <section v-if="activeStep.matrices.length" class="transform-card" aria-labelledby="transform-title">
            <div class="transform-heading">
              <div class="transform-title-wrap"><span class="transform-icon" aria-hidden="true">↔</span><div><h3 id="transform-title">初等变换</h3><p>选择目标矩阵、行或列，再选择一种变换。</p></div></div>
              <div class="axis-switch" role="group" aria-label="变换方向">
                <button type="button" :class="{ 'axis-switch__button--active': transformAxis === 'row' }" @click="transformAxis = 'row'">行变换</button>
                <button type="button" :class="{ 'axis-switch__button--active': transformAxis === 'column' }" @click="transformAxis = 'column'">列变换</button>
              </div>
            </div>
            <div class="transform-controls">
              <label class="form-field operation-field"><span>目标矩阵</span><select v-model.number="selectedMatrixId" @change="selectedCell = null">
                <option v-for="matrix in activeStep.matrices" :key="matrix.id" :value="matrix.id">矩阵 {{ matrix.name }}（{{ matrix.cells.length }}×{{ matrix.cells[0]?.length }}）</option>
              </select></label>
              <label class="form-field operation-field"><span>变换类型</span><select v-model="transformKind">
                <option value="swap">交换两{{ transformAxis === 'row' ? '行' : '列' }}</option><option value="scale">用非零数倍乘</option><option value="add">倍加到另一{{ transformAxis === 'row' ? '行' : '列' }}</option>
              </select></label>
              <label class="form-field"><span>{{ transformKind === 'swap' ? '第一项' : '目标' }}</span><select v-model.number="targetIndex"><option v-for="choice in axisChoices" :key="choice" :value="choice">{{ transformAxis === 'row' ? 'R' : 'C' }}{{ choice }}</option></select></label>
              <label v-if="transformKind !== 'scale'" class="form-field"><span>{{ transformKind === 'add' ? '来源' : '第二项' }}</span><select v-model.number="sourceIndex"><option v-for="choice in axisChoices" :key="choice" :value="choice">{{ transformAxis === 'row' ? 'R' : 'C' }}{{ choice }}</option></select></label>
              <label v-if="transformKind !== 'swap'" class="form-field coefficient-field"><span>{{ transformKind === 'scale' ? '倍乘系数' : '来源的倍数' }}</span><input v-model="coefficientInput" type="text" :placeholder="transformKind === 'scale' ? '例如 2/3 或 x' : '例如 x 或 1/2x+1'" spellcheck="false" @input="operationError = ''" @keydown.enter.prevent="applyTransform" /></label>
              <button class="button button--primary transform-submit" type="button" @click="applyTransform">应用并记录 <span aria-hidden="true">→</span></button>
            </div>
            <p v-if="operationError" class="form-error" role="alert">{{ operationError }}</p>
            <p class="transform-example"><span aria-hidden="true">↳</span>{{ transformKind === 'swap' ? `交换所选的两${transformAxis === 'row' ? '行' : '列'}` : transformKind === 'scale' ? `将所选${transformAxis === 'row' ? '行' : '列'}的每个元素乘以系数；含未知数时须满足系数 ≠ 0，条件会记录到新步骤` : `目标${transformAxis === 'row' ? '行' : '列'}加上来源${transformAxis === 'row' ? '行' : '列'}的指定倍数` }}</p>
          </section>

          <section class="comparison-section" aria-labelledby="comparison-title">
            <div class="section-heading"><div><p class="eyebrow">STEP COMPARISON</p><h3 id="comparison-title">演算过程</h3></div>
              <div class="process-actions">
                <span v-if="comparisonSteps.length > 1" class="compare-label"><span aria-hidden="true">◫</span> 相邻步骤对照</span>
                <div class="process-undo">
                  <button class="button button--quiet" type="button" :disabled="!state.undoStack.length" @click="undo"><span aria-hidden="true">↶</span> 撤销最近操作</button>
                  <span class="undo-hint">{{ state.undoStack.length ? '包括撤销刚生成的步骤' : '暂无可撤销操作' }}</span>
                </div>
              </div>
            </div>
            <div class="comparison-grid" :class="{ 'comparison-grid--single': comparisonSteps.length === 1 }">
              <article v-for="item in comparisonSteps" :key="item.step.id" class="step-panel" :class="{ 'step-panel--active': item.editable }">
                <div class="step-panel-heading"><div><span class="matrix-step-kicker">{{ item.editable ? '当前步骤' : '相邻步骤' }}</span><h4>步骤 {{ state.steps.findIndex((step) => step.id === item.step.id) + 1 }}</h4></div>
                  <span class="matrix-count-badge">{{ item.step.matrices.length }} 张矩阵</span></div>
                <div v-if="item.step.matrices.length" class="matrix-collection">
                  <article v-for="matrix in item.step.matrices" :key="matrix.id" class="matrix-entry" :class="{ 'matrix-entry--target': item.editable && matrix.id === selectedMatrixId }" @click="item.editable && selectMatrix(matrix)">
                    <div class="matrix-card-heading"><div class="matrix-heading-main"><span class="matrix-step-kicker">{{ item.editable && matrix.id === selectedMatrixId ? '操作目标' : '矩阵' }}</span><div class="matrix-name-line">
                      <input v-if="item.editable" class="matrix-name-input" :value="matrix.name" maxlength="20" :aria-label="`矩阵 ${matrix.name} 的名称`" title="点击修改矩阵名称" spellcheck="false" @focus="selectNameText" @blur="commitMatrixName(matrix, $event)" @keydown.enter.prevent="finishNameEditing" @keydown.esc.prevent="cancelNameEditing(matrix, $event)" />
                      <h4 v-else>{{ matrix.name }}</h4>
                      <span v-if="item.editable" class="matrix-name-edit-icon" aria-hidden="true">✎</span>
                    </div></div>
                      <div class="matrix-entry-actions"><span class="matrix-size-badge">{{ matrix.cells.length }} × {{ matrix.cells[0]?.length ?? 0 }}</span>
                        <button v-if="item.editable" class="matrix-delete-button" type="button" :aria-label="`删除矩阵 ${matrix.name}`" title="从当前步骤删除此矩阵" @click.stop="deleteMatrix(matrix)">删除</button></div></div>
                    <div v-if="item.editable" class="matrix-dimension-actions" @click.stop>
                      <span>调整尺寸</span>
                      <button type="button" :disabled="matrix.cells.length >= 10" :aria-label="`${matrix.name} 增加一行`" @click="resizeMatrix(matrix, 'row', 'add')">＋行</button>
                      <button type="button" :disabled="matrix.cells.length <= 1" :aria-label="`${matrix.name} 删除末行`" @click="resizeMatrix(matrix, 'row', 'remove')">−行</button>
                      <button type="button" :disabled="(matrix.cells[0]?.length ?? 0) >= 10" :aria-label="`${matrix.name} 增加一列`" @click="resizeMatrix(matrix, 'column', 'add')">＋列</button>
                      <button type="button" :disabled="(matrix.cells[0]?.length ?? 0) <= 1" :aria-label="`${matrix.name} 删除末列`" @click="resizeMatrix(matrix, 'column', 'remove')">−列</button>
                    </div>
                    <MatrixGrid :key="`${item.step.id}-${matrix.id}-${matrix.cells.length}-${matrix.cells[0]?.length ?? 0}`" :cells="matrix.cells" :name="matrix.name" :editable="item.editable" :swap-mode="swapMode && item.editable && matrix.id === selectedMatrixId" :selected-cell="item.editable && selectedCell?.matrixId === matrix.id ? selectedCell : null"
                      @commit-cell="workspace.setCell(item.step.id, matrix.id, $event.row, $event.column, $event.value)" @select-cell="chooseCell(matrix.id, $event)" />
                    <p v-if="item.editable && swapMode && matrix.id === selectedMatrixId" class="swap-helper">{{ selectedCell ? '再选一个单元格完成交换。' : '先选择第一个单元格。' }}</p>
                  </article>
                </div>
                <p v-else class="empty-matrices empty-matrices--inside">这一步没有矩阵。</p>
                <label v-if="item.editable" class="note-field"><span>这一步的说明</span><textarea v-model="noteDraft" rows="2" placeholder="例如：A 的 R₂ ← R₂ − 2R₁" @blur="commitNote"></textarea></label>
                <div v-else class="note-readonly"><span>步骤说明</span><p>{{ item.step.note || '尚未填写说明' }}</p></div>
              </article>
            </div>
          </section>
        </template>

        <div v-if="notice" class="notice" :class="{ 'notice--error': noticeIsError }" role="status" aria-live="polite"><span>{{ noticeIsError ? '!' : '✓' }}</span>{{ notice }}</div>
        <footer class="page-footer"><span><i class="footer-dot"></i>演算由你决定，工具负责清晰呈现。</span><span>矩阵草稿台 · 仅当前页面有效</span></footer>
      </section>
    </main>
  </div>
</template>
