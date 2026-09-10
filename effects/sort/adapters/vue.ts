/*
 * Vue adapter for Sort. Thin on purpose. It wires a ref to the core and nothing
 * else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { createSort, sortDefaults, type SortOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Sort = defineComponent({
  name: 'Sort',
  props: {
    text: { type: String, required: true },
    tag: { type: String, default: 'span' },
    split: { type: String as () => SortOptions['split'], default: sortDefaults.split },
    order: { type: String as () => SortOptions['order'], default: sortDefaults.order },
    stagger: { type: Number, default: sortDefaults.stagger },
    duration: { type: Number, default: sortDefaults.duration },
    rise: { type: Number, default: sortDefaults.rise },
    blur: { type: Number, default: sortDefaults.blur },
    scale: { type: Number, default: sortDefaults.scale },
    seed: { type: Number, default: sortDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createSort(host.value, props as Partial<SortOptions>)
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
