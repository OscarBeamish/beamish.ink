/*
 * Vue adapter for CircularText. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { createCircularText, circularTextDefaults, type CircularTextOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const CircularText = defineComponent({
  name: 'CircularText',
  props: {
    text: { type: String, required: true },
    tag: { type: String, default: 'span' },
    radius: { type: Number, default: circularTextDefaults.radius },
    repeat: { type: Number, default: circularTextDefaults.repeat },
    separator: { type: String, default: circularTextDefaults.separator },
    size: { type: Number, default: circularTextDefaults.size },
    spin: { type: Number, default: circularTextDefaults.spin },
    inside: { type: Boolean, default: circularTextDefaults.inside },
    distort: { type: Boolean, default: circularTextDefaults.distort },
    period: { type: Number, default: circularTextDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createCircularText(host.value, props as Partial<CircularTextOptions>)
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

export default CircularText
