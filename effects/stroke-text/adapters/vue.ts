/*
 * Vue adapter for StrokeText. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { createStrokeText, strokeTextDefaults, type StrokeTextOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const StrokeText = defineComponent({
  name: 'StrokeText',
  props: {
    text: { type: String, required: true },
    tag: { type: String, default: 'span' },
    outline: { type: String, default: strokeTextDefaults.outline },
    ink: { type: String, default: strokeTextDefaults.ink },
    paper: { type: String, default: strokeTextDefaults.paper },
    width: { type: Number, default: strokeTextDefaults.width },
    level: { type: Number, default: strokeTextDefaults.level },
    duration: { type: Number, default: strokeTextDefaults.duration },
    hold: { type: Number, default: strokeTextDefaults.hold },
    tilt: { type: Number, default: strokeTextDefaults.tilt },
    wobble: { type: Number, default: strokeTextDefaults.wobble },
    seed: { type: Number, default: strokeTextDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createStrokeText(host.value, props as Partial<StrokeTextOptions>)
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

export default StrokeText
