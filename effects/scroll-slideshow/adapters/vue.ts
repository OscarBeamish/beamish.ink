/*
 * Vue adapter for Spool. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createScrollSlideshow, scrollSlideshowDefaults, type ScrollSlideshowOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Spool = defineComponent({
  name: 'Spool',
  props: {
    paper: { type: String, default: scrollSlideshowDefaults.paper },
    bend: { type: Number, default: scrollSlideshowDefaults.bend },
    slip: { type: Number, default: scrollSlideshowDefaults.slip },
    fringe: { type: Number, default: scrollSlideshowDefaults.fringe },
    grain: { type: Number, default: scrollSlideshowDefaults.grain },
    reference: { type: Number, default: scrollSlideshowDefaults.reference },
    crossfade: { type: Number, default: scrollSlideshowDefaults.crossfade },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createScrollSlideshow(host.value, props as Partial<ScrollSlideshowOptions>)
      if (props.autoStart) handle.start()
    })

    // Every option but `sheets` is a uniform or a camera value, so this is free.
    // Changing the count rebuilds the InstancedMesh; do not bind it to a drag.
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

export default Spool
