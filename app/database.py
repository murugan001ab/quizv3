import os
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

_raw_url = os.getenv("DATABASE_URL", "")

if _raw_url.startswith("postgres://"):
    _raw_url = _raw_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif _raw_url.startswith("postgresql://"):
    _raw_url = _raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)

DATABASE_URL = _raw_url

_connect_args = {}
if "sslmode=require" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("?sslmode=require", "").replace("&sslmode=require", "")
    _connect_args = {"ssl": "require"}

engine = create_async_engine(DATABASE_URL, echo=False, connect_args=_connect_args)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        from app.models import user, quiz
        await conn.run_sync(Base.metadata.create_all)
        # This project predates Alembic revisions. Keep upgrades strictly
        # additive and idempotent until its formal revision history is added.
        migrations = (
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS quiz_type VARCHAR NOT NULL DEFAULT 'scheduled'",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS instructions TEXT",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS duration_minutes INTEGER",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'draft'",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS passing_percentage DOUBLE PRECISION NOT NULL DEFAULT 0",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 1",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS allow_retakes BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS randomize_questions BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS randomize_answers BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS random_question_count INTEGER",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS random_question_categories JSONB NOT NULL DEFAULT '[]'::jsonb",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS show_results BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS show_answers BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS instant_feedback BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS allow_navigation BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS allow_bookmarking BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS allow_question_review BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS security_settings JSONB NOT NULL DEFAULT '{}'::jsonb",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type VARCHAR NOT NULL DEFAULT 'multiple_choice'",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS points DOUBLE PRECISION NOT NULL DEFAULT 1",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS expected_answers JSONB NOT NULL DEFAULT '[]'::jsonb",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS case_sensitive BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_feedback TEXT",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS incorrect_feedback TEXT",
            "ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'in_progress'",
            "ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS max_points DOUBLE PRECISION NOT NULL DEFAULT 0",
            "ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS obtained_points DOUBLE PRECISION NOT NULL DEFAULT 0",
            "ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS percentage DOUBLE PRECISION NOT NULL DEFAULT 0",
            "ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS total_points DOUBLE PRECISION NOT NULL DEFAULT 0",
            "ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS time_spent_seconds INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1",
            "ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS passed BOOLEAN",
            "ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS auto_submitted BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS correct_answers INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS incorrect_answers INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS partial_answers INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS unanswered_questions INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS question_order JSONB NOT NULL DEFAULT '[]'::jsonb",
            "ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS bookmarks JSONB NOT NULL DEFAULT '[]'::jsonb",
            "CREATE INDEX IF NOT EXISTS ix_quiz_attempts_status ON quiz_attempts (status)",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS public_slug VARCHAR",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_quizzes_public_slug ON quizzes (public_slug) WHERE public_slug IS NOT NULL",
            "ALTER TABLE quiz_attempts ALTER COLUMN user_id DROP NOT NULL",
            "ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS guest_name VARCHAR",
            "ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS guest_email VARCHAR",
            # Question Management module — extended question types
            "ALTER TABLE questions ALTER COLUMN correct_option DROP NOT NULL",
            "ALTER TABLE questions ALTER COLUMN options SET DEFAULT '[]'::jsonb",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS category VARCHAR",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty VARCHAR",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_options JSONB NOT NULL DEFAULT '[]'::jsonb",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS partial_scoring BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS matching_data JSONB NOT NULL DEFAULT '{}'::jsonb",
            # Student Test Taking module — manual grading + lazy expiry states
            "ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS manual_grades JSONB NOT NULL DEFAULT '{}'::jsonb",
            "CREATE TABLE IF NOT EXISTS groups (id SERIAL PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, name VARCHAR NOT NULL, description TEXT, created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(), updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW())",
            "ALTER TABLE groups ADD COLUMN IF NOT EXISTS invite_token VARCHAR",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_groups_invite_token ON groups (invite_token) WHERE invite_token IS NOT NULL",
            "CREATE INDEX IF NOT EXISTS ix_groups_owner_id ON groups (owner_id)",
            "CREATE TABLE IF NOT EXISTS group_members (group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE, student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(), PRIMARY KEY (group_id, student_id))",
            "CREATE INDEX IF NOT EXISTS ix_group_members_student_id ON group_members (student_id)",
            "CREATE TABLE IF NOT EXISTS test_assignments (id SERIAL PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE, student_id INTEGER REFERENCES users(id) ON DELETE CASCADE, group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE, assigned_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(), due_at TIMESTAMP WITHOUT TIME ZONE, status VARCHAR NOT NULL DEFAULT 'assigned')",
            "CREATE INDEX IF NOT EXISTS ix_test_assignments_owner_id ON test_assignments (owner_id)",
            "CREATE INDEX IF NOT EXISTS ix_test_assignments_quiz_id ON test_assignments (quiz_id)",
            "CREATE INDEX IF NOT EXISTS ix_test_assignments_student_id ON test_assignments (student_id)",
            "CREATE INDEX IF NOT EXISTS ix_test_assignments_group_id ON test_assignments (group_id)",
        )
        for statement in migrations:
            await conn.execute(text(statement))
