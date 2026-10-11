/*
 * Vue adapter for ChromeForm. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createChromeForm, chromeFormDefaults, type ChromeFormOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const ChromeForm = defineComponent({
  name: 'ChromeForm',
  props: {
    background: { type: String, default: chromeFormDefaults.background },
    tint: { type: String, default: chromeFormDefaults.tint },
    studio: { type: String, default: chromeFormDefaults.studio },
    roughness: { type: Number, default: chromeFormDefaults.roughness },
    lamps: { type: Number, default: chromeFormDefaults.lamps },
    height: { type: Number, default: chromeFormDefaults.height },
    girth: { type: Number, default: chromeFormDefaults.girth },
    waist: { type: Number, default: chromeFormDefaults.waist },
    tilt: { type: Number, default: chromeFormDefaults.tilt },
    period: { type: Number, default: chromeFormDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createChromeForm(host.value, props as Partial<ChromeFormOptions>)
      if (props.autoStart) handle.start()
    })

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

export default ChromeForm
