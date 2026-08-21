"""
Run once to populate sample quizzes and questions.
Usage:
    python seed.py
"""

import asyncio
from datetime import datetime
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

from app.database import AsyncSessionLocal, init_db
from app.models.quiz import Quiz, Question, DifficultyLevel, QuizType

load_dotenv()

IST = ZoneInfo("Asia/Kolkata")


def now_ist():
    # Return timezone-naive IST datetime
    return datetime.now(IST).replace(tzinfo=None)



async def seed_part1_concepts(db):
    quiz = Quiz(
        title="Python Programming - Part 1 Concepts",
        description="Data types , strings,Numbers,List,Work flow controls",
        difficulty=DifficultyLevel.easy,
        subject="Programming",
        topic="Python Programming Basics",
        quiz_type=QuizType.live.value,
        is_active=True,
    )

    quiz.questions.extend([
       
           Question(
    text="What is the type returned by input() by default?",
    options=["int", "float", "str", "bool"],
    correct_option=2,
    explanation="The input() function always returns the user's input as a string. Numeric conversion requires functions such as int() or float()."
),

Question(
    text="What is the output of print(2 + 3 * 4 ** 2)?",
    options=["400", "50", "26", "80"],
    correct_option=1,
    explanation="Python follows operator precedence. 4 ** 2 is evaluated first, giving 16; then 3 * 16 gives 48; finally 2 + 48 gives 50."
),

Question(
    text="What is the output of the following code? x = 10; y = x; x = 20; print(y)",
    options=["10", "20", "30", "NameError"],
    correct_option=0,
    explanation="y receives the value 10 when the assignment y = x executes. Reassigning x to 20 later does not change y."
),

Question(
    text="Which operator performs true division in Python?",
    options=["//", "/", "%", "**"],
    correct_option=1,
    explanation="The / operator performs true division and normally produces a floating-point result. For example, 10 / 3 produces approximately 3.3333."
),

Question(
    text="What is the result of 10 // 3?",
    options=["3", "3.33", "1", "4"],
    correct_option=0,
    explanation="The // operator performs floor division. 10 divided by 3 is 3.333..., and floor division gives 3."
),

Question(
    text="What is the result of 10 % 3?",
    options=["3", "1", "0", "3.33"],
    correct_option=1,
    explanation="The % operator returns the remainder of division. 10 divided by 3 leaves a remainder of 1."
),

Question(
    text="What is the output of the following code? word = 'Python'; print(word[-1])",
    options=["P", "n", "o", "Python"],
    correct_option=1,
    explanation="Negative indexing starts from the end of a sequence. Index -1 refers to the last character, which is 'n'."
),

Question(
    text="What is the output of 'Python'[1:5]?",
    options=["Pyth", "ytho", "ython", "yth"],
    correct_option=1,
    explanation="Python slicing uses start:stop, where the stop index is excluded. Indexes 1, 2, 3, and 4 produce 'ytho'."
),

Question(
    text="Which statement about Python strings is correct?",
    options=[
        "Strings are mutable",
        "Strings can be modified character by character",
        "Strings are immutable",
        "Strings can contain only numbers"
    ],
    correct_option=2,
    explanation="Python strings are immutable. An existing string cannot have one of its characters directly replaced."
),

Question(
    text="What is the output of the following code? numbers = [10, 20, 30]; numbers[1] = 99; print(numbers)",
    options=[
        "[10, 20, 30]",
        "[99, 20, 30]",
        "[10, 99, 30]",
        "TypeError"
    ],
    correct_option=2,
    explanation="Lists are mutable, so individual elements can be changed. Index 1 originally contains 20 and is replaced with 99."
),

Question(
    text="What is the output of list(range(2, 10, 3))?",
    options=[
        "[2, 5, 8]",
        "[2, 5, 8, 11]",
        "[2, 3, 4, 5, 6, 7, 8, 9]",
        "[2, 6, 10]"
    ],
    correct_option=0,
    explanation="range(2, 10, 3) starts at 2 and increases by 3. It produces 2, 5, and 8. The stop value 10 is excluded."
),

Question(
    text="What is the output of the following code? for i in range(5): if i == 2: break; print(i)",
    options=[
        "0 1 2",
        "0 1",
        "1 2",
        "0 1 2 3 4"
    ],
    correct_option=1,
    explanation="When i becomes 2, break immediately terminates the loop before print(i) executes for that iteration. Therefore only 0 and 1 are printed."
),

Question(
    text="What is the purpose of the continue statement inside a loop?",
    options=[
        "Terminate the entire program",
        "Terminate the loop permanently",
        "Skip the current iteration and continue with the next iteration",
        "Do nothing"
    ],
    correct_option=2,
    explanation="continue skips the remaining statements in the current iteration and moves directly to the next iteration of the loop."
),

Question(
    text="What is the output of the following code? for i in range(5): if i == 2: continue; print(i)",
    options=[
        "0 1 2 3 4",
        "0 1 3 4",
        "0 1",
        "2"
    ],
    correct_option=1,
    explanation="When i equals 2, continue skips print(i) for that iteration. The loop continues with 3 and 4."
),

Question(
    text="When does the else clause of a for loop execute?",
    options=[
        "Whenever the loop contains an if statement",
        "Only when the loop executes zero times",
        "When the loop completes normally without encountering break",
        "Whenever continue is used"
    ],
    correct_option=2,
    explanation="A loop's else clause executes when the loop finishes normally. If break terminates the loop, the else clause is skipped."
),

Question(
    text="What is the output of the following code? for i in range(5): if i == 2: break else: print('Done')",
    options=[
        "Done",
        "0 1 Done",
        "0 1",
        "2 Done"
    ],
    correct_option=2,
    explanation="The loop encounters break when i equals 2. Because the loop terminates using break, its else clause does not execute. The loop body prints 0 and 1."
),

Question(
    text="What does the pass statement do in Python?",
    options=[
        "Stops the current loop",
        "Skips the current iteration",
        "Performs no operation",
        "Returns a value"
    ],
    correct_option=2,
    explanation="pass is a null operation. It does nothing when executed and is commonly used as a placeholder where Python requires a statement."
),

Question(
    text="Which statement correctly distinguishes break, continue, and pass?",
    options=[
        "break skips, continue stops, pass repeats",
        "break stops the loop, continue skips an iteration, pass does nothing",
        "All three stop the loop",
        "break and continue are identical, while pass stops execution"
    ],
    correct_option=1,
    explanation="break terminates the nearest enclosing loop, continue skips to the next iteration, and pass performs no operation."
),

Question(
    text="What is the output of the following code? x = 10; if x > 5: if x < 15: print('A') else: print('B') else: print('C')",
    options=["A", "B", "C", "Nothing"],
    correct_option=0,
    explanation="x > 5 is True, so Python enters the first if block. Then x < 15 is also True, so 'A' is printed."
),

Question(
    text="What is the output of the following code? numbers = [1, 2, 3, 4, 5]; for number in numbers: if number % 2 == 0: continue; print(number)",
    options=[
        "1 2 3 4 5",
        "2 4",
        "1 3 5",
        "1 2 3"
    ],
    correct_option=2,
    explanation="Even numbers have a remainder of 0 when divided by 2. continue skips those iterations, so only the odd numbers 1, 3, and 5 are printed."
),
    ])

    db.add(quiz)
    await db.commit()
    print("✅ Part 1 Concepts seeded successfully.")


async def seed():
    await init_db()

    async with AsyncSessionLocal() as db:
        try:
            await seed_part1_concepts(db)

            print("🚀 Seed process completed successfully!")
        except Exception as e:
            await db.rollback()
            print(f"❌ Error during seeding: {e}")
            raise


if __name__ == "__main__":
    asyncio.run(seed())