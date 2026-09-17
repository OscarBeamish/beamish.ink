/*
 * Vue adapter for Tally. Thin on purpose. It wires a ref to the core and nothing
 * else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { createCountUpNumber, countUpNumberDefaults, type CountUpNumberOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Tally = defineComponent({
  name: 'Tally',
  props: {
    text: { type: String, required: true },
    tag: { type: String, default: 'span' },
    from: { type: Number, default: countUpNumberDefaults.from },
    duration: { type: Number, default: countUpNumberDefaults.duration },
    decimals: { type: Number, default: countUpNumberDefaults.decimals },
    locale: { type: String, default: countUpNumberDefaults.locale },
    prefix: { type: String, default: countUpNumberDefaults.prefix },
    suffix: { type: String, default: countUpNumberDefaults.suffix },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createCountUpNumber(host.value, props as Partial<CountUpNumberOptions>)
      if (props.autoStart) handle.start()
    }

    onMounted(build)
    // The count has to be rebuilt when the figure changes.
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

export default Tally
