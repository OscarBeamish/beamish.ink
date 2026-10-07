/*
 * Vue adapter for PaperGrain. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createPaperGrain, paperGrainDefaults, type PaperGrainOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const PaperGrain = defineComponent({
  name: 'PaperGrain',
  props: {
    paper: { type: String, default: paperGrainDefaults.paper },
    fibre: { type: String, default: paperGrainDefaults.fibre },
    scale: { type: Number, default: paperGrainDefaults.scale },
    direction: { type: Number, default: paperGrainDefaults.direction },
    stretch: { type: Number, default: paperGrainDefaults.stretch },
    formation: { type: Number, default: paperGrainDefaults.formation },
    tooth: { type: Number, default: paperGrainDefaults.tooth },
    light: { type: Number, default: paperGrainDefaults.light },
    relief: { type: Number, default: paperGrainDefaults.relief },
    sweep: { type: Number, default: paperGrainDefaults.sweep },
    shive: { type: Number, default: paperGrainDefaults.shive },
    period: { type: Number, default: paperGrainDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createPaperGrain(host.value, props as Partial<PaperGrainOptions>)
      if (props.autoStart) handle.start()
    })

    watchEffect(() => {
      handle?.update({ ...props })
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    return () => h('div', { ref: host })
  }
})

export default PaperGrain
