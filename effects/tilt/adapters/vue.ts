/*
 * Vue adapter for Tilt. Thin on purpose. It wires a ref to the core and nothing
 * else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createTilt, tiltDefaults, type TiltOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Tilt = defineComponent({
  name: 'Tilt',
  props: {
    /** The element to render. It is the element that leans. */
    tag: { type: String, default: 'div' },
    maxTilt: { type: Number, default: tiltDefaults.maxTilt },
    perspective: { type: Number, default: tiltDefaults.perspective },
    scale: { type: Number, default: tiltDefaults.scale },
    sheen: { type: Number, default: tiltDefaults.sheen },
    sheenColor: { type: String, default: tiltDefaults.sheenColor },
    sheenSize: { type: Number, default: tiltDefaults.sheenSize },
    ease: { type: Number, default: tiltDefaults.ease },
    invert: { type: Boolean, default: tiltDefaults.invert },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createTilt(host.value, props as Partial<TiltOptions>)
      if (props.autoStart) handle.start()
    })

    // Pushes changed options into the running effect rather than remounting it.
    watchEffect(() => {
      handle?.update({ ...props })
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    return () => h(props.tag, { ref: host }, slots['default']?.())
  }
})

export default Tilt
