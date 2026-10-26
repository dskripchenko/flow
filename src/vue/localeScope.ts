/**
 * Locale handling shared by FlowView and FlowEditor. The kit's locale comes
 * from the host (a parent UidLocaleProvider) and is never overridden unless
 * the component's own `locale` prop is set; the package's strings follow the
 * explicit prop, else the host's kit locale (ru-* → Russian, else English).
 */
import { computed, defineComponent, type ComputedRef } from 'vue'
import { UidLocaleProvider, en as uidEn, ru as uidRu, useLocale } from '@dskripchenko/ui'

/** Renders its slot as is: stands in for UidLocaleProvider when the host's locale should apply. */
export const LocalePassthrough = defineComponent({
  name: 'FlowLocalePassthrough',
  setup: (_, { slots }) => () => slots.default?.(),
})

export function useLocaleScope(explicit: () => string | undefined): {
  /** 'en', 'ru' or the host-given code: the package's strings and date formatting. */
  lang: ComputedRef<string>
  /** What wraps the component: the kit provider when `locale` is set, else a pass-through. */
  wrapper: ComputedRef<typeof UidLocaleProvider | typeof LocalePassthrough>
  wrapperProps: ComputedRef<Record<string, unknown>>
} {
  // Read in the component's own setup: this is the host's (or the kit's default) locale.
  const host = useLocale()
  const lang = computed(() => explicit() ?? (host.value.code?.toLowerCase().startsWith('ru') ? 'ru' : 'en'))
  return {
    lang,
    wrapper: computed(() => (explicit() ? UidLocaleProvider : LocalePassthrough)),
    wrapperProps: computed(() => (explicit() ? { locale: explicit() === 'ru' ? uidRu : uidEn } : {})),
  }
}
