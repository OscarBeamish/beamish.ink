/*
 * Vue adapter for Sundial. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createCastShadowScene, castShadowSceneDefaults, type CastShadowSceneOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Sundial = defineComponent({
  name: 'Sundial',
  props: {
    paper: { type: String, default: castShadowSceneDefaults.paper },
    stone: { type: String, default: castShadowSceneDefaults.stone },
    accent: { type: String, default: castShadowSceneDefaults.accent },
    elevation: { type: Number, default: castShadowSceneDefaults.elevation },
    softness: { type: Number, default: castShadowSceneDefaults.softness },
    shadow: { type: Number, default: castShadowSceneDefaults.shadow },
    zoom: { type: Number, default: castShadowSceneDefaults.zoom },
    tilt: { type: Number, default: castShadowSceneDefaults.tilt },
    period: { type: Number, default: castShadowSceneDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createCastShadowScene(host.value, props as Partial<CastShadowSceneOptions>)
      if (props.autoStart) handle.start()
    })

    // Pushes changed options into the running scene rather than remounting it.
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

export default Sundial
