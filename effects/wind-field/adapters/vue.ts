/*
 * Vue adapter for WindField. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createWindField, windFieldDefaults, type WindFieldOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const WindField = defineComponent({
  name: 'WindField',
  props: {
    ground: { type: String, default: windFieldDefaults.ground },
    calm: { type: String, default: windFieldDefaults.calm },
    mid: { type: String, default: windFieldDefaults.mid },
    strong: { type: String, default: windFieldDefaults.strong },
    systems: { type: Number, default: windFieldDefaults.systems },
    drift: { type: Number, default: windFieldDefaults.drift },
    wander: { type: Number, default: windFieldDefaults.wander },
    scale: { type: Number, default: windFieldDefaults.scale },
    length: { type: Number, default: windFieldDefaults.length },
    turns: { type: Number, default: windFieldDefaults.turns },
    contrast: { type: Number, default: windFieldDefaults.contrast },
    seed: { type: Number, default: windFieldDefaults.seed },
    period: { type: Number, default: windFieldDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createWindField(host.value, props as Partial<WindFieldOptions>)
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

export default WindField
