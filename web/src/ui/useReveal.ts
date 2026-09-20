import { onMounted, onUnmounted, type Ref } from 'vue'
/** Content remains visible if observation is unavailable or motion is reduced. */
export function useReveal(root: Ref<HTMLElement | undefined>) {
  let observer: IntersectionObserver | undefined
  onMounted(() => {
    if (!root.value || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed')
        observer?.unobserve(entry.target)
      }
    }, { threshold: .12 })
    root.value.querySelectorAll<HTMLElement>('[data-reveal]').forEach(el => {
      if (el.getBoundingClientRect().top > innerHeight * .85) el.classList.add('reveal-pending')
      observer?.observe(el)
    })
  })
  onUnmounted(() => observer?.disconnect())
}
