/*
 * Vue adapter for PointerLitBusts. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import {
  createPointerLitBusts,
  pointerLitBustsDefaults,
  type PointerLitBustsOptions
} from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const PointerLitBusts = defineComponent({
  name: 'PointerLitBusts',
  props: {
    lamp: { type: Number, default: pointerLitBustsDefaults.lamp },
    lampColour: { type: String, default: pointerLitBustsDefaults.lampColour },
    reach: { type: Number, default: pointerLitBustsDefaults.reach },
    sweep: { type: Number, default: pointerLitBustsDefaults.sweep },
    rim: { type: Number, default: pointerLitBustsDefaults.rim },
    rimColour: { type: String, default: pointerLitBustsDefaults.rimColour },
    room: { type: String, default: pointerLitBustsDefaults.room },
    parallax: { type: Number, default: pointerLitBustsDefaults.parallax },
    polish: { type: Number, default: pointerLitBustsDefaults.polish },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    /*
     * Built once. The scene is expensive to make and nothing about it depends
     * on a slot, so rebuilding would discard a context and a set of compiled
     * programmes for nothing. Option changes go through update().
     */
    onMounted(() => {
      if (!host.value) return
      handle = createPointerLitBusts(host.value, props as Partial<PointerLitBustsOptions>)
      if (props.autoStart) handle.start()
    })

    watchEffect(() => {
      handle?.update({ ...props })
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    // The element needs a height from your own CSS. A scene in a zero-height
    // box builds its context, renders nothing, and says nothing about why.
    return () => h('div', { ref: host })
  }
})

export default PointerLitBusts
