/*
 * Vue adapter for MetaballField. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createMetaballField, metaballFieldDefaults, type MetaballFieldOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const MetaballField = defineComponent({
  name: 'MetaballField',
  props: {
    background: { type: String, default: metaballFieldDefaults.background },
    body: { type: String, default: metaballFieldDefaults.body },
    light: { type: String, default: metaballFieldDefaults.light },
    count: { type: Number, default: metaballFieldDefaults.count },
    radius: { type: Number, default: metaballFieldDefaults.radius },
    blend: { type: Number, default: metaballFieldDefaults.blend },
    orbit: { type: Number, default: metaballFieldDefaults.orbit },
    detail: { type: Number, default: metaballFieldDefaults.detail },
    shine: { type: Number, default: metaballFieldDefaults.shine },
    period: { type: Number, default: metaballFieldDefaults.period },
    seed: { type: Number, default: metaballFieldDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createMetaballField(host.value, props as Partial<MetaballFieldOptions>)
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

export default MetaballField
