// Small helpers for client-side shuffling of quiz questions/options.
//
// Important: shuffling is purely a *display* concern. The backend always
// scores answers using the ORIGINAL option index, so any code that shuffles
// options must keep a mapping back to the original index and use that when
// submitting an answer.

// Fisher-Yates shuffle. Returns a new array, does not mutate the input.
export function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Returns a shuffled order for `count` items, e.g. shuffleIndices(4) might
// give [2, 0, 3, 1]. order[displayIndex] === originalIndex.
export function shuffleIndices(count) {
  return shuffleArray(Array.from({ length: count }, (_, i) => i))
}

// Shuffles a question's options and returns both the shuffled options array
// (for rendering) and the order mapping (order[displayIndex] === originalIndex).
export function shuffleOptions(options) {
  const order = shuffleIndices(options.length)
  return { options: order.map(i => options[i]), order }
}

// Shuffles an array of questions and, for each question, shuffles its
// options too. Each returned question gets an extra `optionOrder` field:
// optionOrder[displayIndex] === originalOptionIndex.
export function shuffleQuizQuestions(questions) {
  return shuffleArray(questions).map(q => {
    const { options, order } = shuffleOptions(q.options)
    return { ...q, options, optionOrder: order }
  })
}
