/*
 * Vue adapter for ImageMelt. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createImageMelt, imageMeltDefaults, type ImageMeltOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const ImageMelt = defineComponent({
  name: 'ImageMelt',
  props: {
    radius: { type: Number, default: imageMeltDefaults.radius },
    feather: { type: Number, default: imageMeltDefaults.feather },
    displace: { type: Number, default: imageMeltDefaults.displace },
    fringe: { type: Number, default: imageMeltDefaults.fringe },
    grain: { type: Number, default: imageMeltDefaults.grain },
    drift: { type: Number, default: imageMeltDefaults.drift },
    period: { type: Number, default: imageMeltDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createImageMelt(host.value, props as Partial<ImageMeltOptions>)
      if (props.autoStart) handle.start()
    })

    watchEffect(() => {
      handle?.update({ ...props } as Partial<ImageMeltOptions>)
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    /* Both pictures are slotted in, stay in the document and are only hidden. */
    return () => h('div', { ref: host }, slots.default?.())
  }
})

export default ImageMelt
