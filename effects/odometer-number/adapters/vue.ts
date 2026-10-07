/*
 * Vue adapter for OdometerNumber. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { createOdometerNumber, odometerNumberDefaults, type OdometerNumberOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const OdometerNumber = defineComponent({
  name: 'OdometerNumber',
  props: {
    text: { type: String, required: true },
    tag: { type: String, default: 'span' },
    from: { type: Number, default: odometerNumberDefaults.from },
    to: { type: Number, default: odometerNumberDefaults.to },
    duration: { type: Number, default: odometerNumberDefaults.duration },
    hold: { type: Number, default: odometerNumberDefaults.hold },
    digits: { type: Number, default: odometerNumberDefaults.digits },
    group: { type: String, default: odometerNumberDefaults.group },
    carry: { type: Number, default: odometerNumberDefaults.carry },
    drum: { type: Number, default: odometerNumberDefaults.drum },
    seed: { type: Number, default: odometerNumberDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createOdometerNumber(host.value, props as Partial<OdometerNumberOptions>)
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

export default OdometerNumber
