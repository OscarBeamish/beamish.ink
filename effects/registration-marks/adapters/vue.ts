/*
 * Vue adapter for RegistrationMarks. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createRegistrationMarks, registrationMarksDefaults, type RegistrationMarksOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const RegistrationMarks = defineComponent({
  name: 'RegistrationMarks',
  props: {
    paper: { type: String, default: registrationMarksDefaults.paper },
    first: { type: String, default: registrationMarksDefaults.first },
    second: { type: String, default: registrationMarksDefaults.second },
    third: { type: String, default: registrationMarksDefaults.third },
    size: { type: Number, default: registrationMarksDefaults.size },
    weight: { type: Number, default: registrationMarksDefaults.weight },
    arms: { type: Number, default: registrationMarksDefaults.arms },
    margin: { type: Number, default: registrationMarksDefaults.margin },
    spread: { type: Number, default: registrationMarksDefaults.spread },
    bar: { type: Number, default: registrationMarksDefaults.bar },
    period: { type: Number, default: registrationMarksDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createRegistrationMarks(host.value, props as Partial<RegistrationMarksOptions>)
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

export default RegistrationMarks
