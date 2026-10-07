/*
 * Vue adapter for RotatingWords. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import {
  createRotatingWords,
  rotatingWordsDefaults,
  type RotatingWordsOptions
} from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const RotatingWords = defineComponent({
  name: 'RotatingWords',
  props: {
    interval: { type: Number, default: rotatingWordsDefaults.interval },
    swap: { type: Number, default: rotatingWordsDefaults.swap },
    rise: { type: Number, default: rotatingWordsDefaults.rise },
    tilt: { type: Number, default: rotatingWordsDefaults.tilt },
    blur: { type: Number, default: rotatingWordsDefaults.blur },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createRotatingWords(host.value, props as Partial<RotatingWordsOptions>)
      if (props.autoStart) handle.start()
    }

    onMounted(build)

    watchEffect(() => {
      handle?.update({ ...props })
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    /*
     * The words come in through the default slot and are never replaced. Pass
     * them as markup rather than as an array of strings: text in a prop is
     * invisible before hydration and nobody translates it.
     */
    return () => h('span', { ref: host }, slots.default?.())
  }
})

export default RotatingWords
