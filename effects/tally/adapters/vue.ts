/*
 * Vue adapter for Tally. Thin on purpose. It wires a ref to the core and nothing
 * else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { createTally, tallyDefaults, type TallyOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Tally = defineComponent({
  name: 'Tally',
  props: {
    text: { type: String, required: true },
    tag: { type: String, default: 'span' },
    from: { type: Number, default: tallyDefaults.from },
    duration: { type: Number, default: tallyDefaults.duration },
    decimals: { type: Number, default: tallyDefaults.decimals },
    locale: { type: String, default: tallyDefaults.locale },
    prefix: { type: String, default: tallyDefaults.prefix },
    suffix: { type: String, default: tallyDefaults.suffix },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createTally(host.value, props as Partial<TallyOptions>)
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
