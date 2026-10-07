/*
 * Vue adapter for FallingLetters. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import {
  createFallingLetters,
  fallingLettersDefaults,
  type FallingLettersOptions
} from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const FallingLetters = defineComponent({
  name: 'FallingLetters',
  props: {
    hold: { type: Number, default: fallingLettersDefaults.hold },
    stagger: { type: Number, default: fallingLettersDefaults.stagger },
    scatter: { type: Number, default: fallingLettersDefaults.scatter },
    gravity: { type: Number, default: fallingLettersDefaults.gravity },
    bounce: { type: Number, default: fallingLettersDefaults.bounce },
    drift: { type: Number, default: fallingLettersDefaults.drift },
    spin: { type: Number, default: fallingLettersDefaults.spin },
    floor: { type: Number, default: fallingLettersDefaults.floor },
    seed: { type: Number, default: fallingLettersDefaults.seed },
    tag: { type: String, default: 'h1' },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createFallingLetters(host.value, props as Partial<FallingLettersOptions>)
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
     * The text comes in through the default slot and is split by the core. Pass
     * text rather than elements: the core owns this element's contents once it
     * has mounted.
     */
    return () => h(props.tag, { ref: host }, slots.default?.())
  }
})

export default FallingLetters
