/*
 * Vue adapter for Sort. Thin on purpose. It wires a ref to the core and nothing
 * else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { createScrambleText, scrambleTextDefaults, type ScrambleTextOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Sort = defineComponent({
  name: 'Sort',
  props: {
    text: { type: String, required: true },
    tag: { type: String, default: 'span' },
    split: { type: String as () => ScrambleTextOptions['split'], default: scrambleTextDefaults.split },
    order: { type: String as () => ScrambleTextOptions['order'], default: scrambleTextDefaults.order },
    stagger: { type: Number, default: scrambleTextDefaults.stagger },
    duration: { type: Number, default: scrambleTextDefaults.duration },
    rise: { type: Number, default: scrambleTextDefaults.rise },
    blur: { type: Number, default: scrambleTextDefaults.blur },
    scale: { type: Number, default: scrambleTextDefaults.scale },
    seed: { type: Number, default: scrambleTextDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createScrambleText(host.value, props as Partial<ScrambleTextOptions>)
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

export default Sort
