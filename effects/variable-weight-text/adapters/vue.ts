/*
 * Vue adapter for VariableWeightText. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { createVariableWeightText, variableWeightTextDefaults, type VariableWeightTextOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const VariableWeightText = defineComponent({
  name: 'VariableWeightText',
  props: {
    text: { type: String, required: true },
    tag: { type: String, default: 'span' },
    axis: { type: String, default: variableWeightTextDefaults.axis },
    rest: { type: Number, default: variableWeightTextDefaults.rest },
    peak: { type: Number, default: variableWeightTextDefaults.peak },
    reach: { type: Number, default: variableWeightTextDefaults.reach },
    shoulder: { type: Number, default: variableWeightTextDefaults.shoulder },
    ease: { type: Number, default: variableWeightTextDefaults.ease },
    steady: { type: Boolean, default: variableWeightTextDefaults.steady },
    tracking: { type: Number, default: variableWeightTextDefaults.tracking },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createVariableWeightText(host.value, props as Partial<VariableWeightTextOptions>)
      if (props.autoStart) handle.start()
    }

    onMounted(build)
    // The split has to be rebuilt when the text changes.
    watch(() => props.text, build)

    watchEffect(() => {
      handle?.update({ ...props })
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    return () => h(props.tag, { ref: host }, props.text)
  }
})

export default VariableWeightText
