/*
 * Vue adapter for MaskedHeading. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { createMaskedHeading, maskedHeadingDefaults, type MaskedHeadingOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const MaskedHeading = defineComponent({
  name: 'MaskedHeading',
  props: {
    text: { type: String, required: true },
    tag: { type: String, default: 'span' },
    direction: { type: String, default: maskedHeadingDefaults.direction },
    duration: { type: Number, default: maskedHeadingDefaults.duration },
    hold: { type: Number, default: maskedHeadingDefaults.hold },
    tear: { type: Number, default: maskedHeadingDefaults.tear },
    fray: { type: Number, default: maskedHeadingDefaults.fray },
    points: { type: Number, default: maskedHeadingDefaults.points },
    overshoot: { type: Number, default: maskedHeadingDefaults.overshoot },
    seed: { type: Number, default: maskedHeadingDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createMaskedHeading(host.value, props as Partial<MaskedHeadingOptions>)
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

export default MaskedHeading
