# Drawing Debug Rules

## Always verify before changing

- log event.target
- log elementsFromPoint()
- confirm which layer handles event

## Never assume

- DOM z-index has NO effect in Drawing
- scene order controls everything

## If interaction fails

Check:

1. Did bridge run?
2. Did guard pass?
3. Did lookup find target?
4. Did redispatch happen?
5. Did target handler fire?

## If ordering fails

Check:

1. embeddable found?
2. reorderElements applied?
3. updateScene called?
4. commitToHistory true?
5. autosave persisted?

## If UI shifts (toolbar issue)

Check:

- parent flex vs absolute
- viewport resize
- devtools docking impact