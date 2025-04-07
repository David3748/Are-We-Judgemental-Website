import praw
# import pandas as pd # Optional, remove if not used
import re
import os
import json
from datetime import datetime, timedelta
import time # Import time for potential delays/retries

# --- Gemini Import ---
import google.generativeai as genai

# --- Configuration ---
# CLIENT_ID = "YOUR_CLIENT_ID" # Use Secrets
# CLIENT_SECRET = "YOUR_CLIENT_SECRET" # Use Secrets
# GOOGLE_API_KEY = "YOUR_GOOGLE_API_KEY" # Use Secrets
USER_AGENT = "AITAScraperDaily:v1.1_Gemini (by /u/Dndelephant)" # Updated UA
SUBREDDIT_NAME = "AmItheAsshole"
NUM_POSTS = 20
COMMENT_LIMIT_PER_POST = 200
OUTPUT_JSON_FILE = "top_aita_posts.json"
SUMMARY_MAX_CHARS = 800 # Target character limit for summary
GEMINI_MODEL = "gemini-2.0-flash-exp"

# --- Functions ---

def setup_reddit_api():
    """Initializes PRAW Reddit instance using environment variables."""
    client_id = os.environ.get('REDDIT_CLIENT_ID')
    client_secret = os.environ.get('REDDIT_CLIENT_SECRET')
    if not client_id or not client_secret:
        raise ValueError("Missing REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET env vars.")
    reddit = praw.Reddit(client_id=client_id, client_secret=client_secret, user_agent=USER_AGENT, read_only=True)
    print(f"PRAW Read-Only Mode: {reddit.read_only}")
    return reddit

def configure_gemini():
    """Configures the Google Generative AI SDK using environment variable."""
    api_key = os.environ.get('GOOGLE_API_KEY')
    if not api_key:
        raise ValueError("Missing GOOGLE_API_KEY environment variable. Set it as GitHub Secret.")
    try:
        genai.configure(api_key=api_key)
        print("Google Generative AI SDK configured.")
        # Check if the model is available upon configuration (optional)
        # models = [m.name for m in genai.list_models()]
        # if f'models/{GEMINI_MODEL}' not in models:
        #     print(f"Warning: Model {GEMINI_MODEL} not found in available models.")
    except Exception as e:
        print(f"Error configuring Google Generative AI SDK: {e}")
        raise

def categorize_comment(comment_text):
    """Categorizes comment based on AITA acronyms."""
    if not comment_text: return None
    text_lower = comment_text.lower()
    if re.search(r'\byta\b', text_lower): return "YTA"
    if re.search(r'\bnta\b', text_lower): return "NTA"
    if re.search(r'\besh\b', text_lower): return "ESH"
    if re.search(r'\bnah\b', text_lower): return "NAH"
    if re.search(r'\binfo\b', text_lower): return "INFO"
    return None

def summarize_with_gemini(text, max_chars=SUMMARY_MAX_CHARS, retries=2, delay=5):
    """Summarizes text using Gemini Flash, trying to stay under max_chars."""
    if not text or len(text) <= max_chars:
        # If already short enough, no need to call API
        return text

    model = genai.GenerativeModel(GEMINI_MODEL)

    prompt = f"""Summarize the following Reddit AITA (Am I the Asshole) post. Focus on the main conflict, the actions taken by the Original Poster (OP), and the question being asked. Keep the summary concise and strictly under {max_chars} characters. Do not add any preamble like "Here is a summary:".

    Post Text:
    ---
    {text}
    ---

    Summary (under {max_chars} characters):"""

    for attempt in range(retries + 1):
        try:
            # Use generate_content for better error handling potential
            response = model.generate_content(prompt)

            # Check if the response has text content
            if response.parts:
                 summary = "".join(part.text for part in response.parts if hasattr(part, 'text'))
            elif hasattr(response, 'text'): # Fallback for older response structures?
                 summary = response.text
            else:
                 # Handle cases where response is blocked or empty
                 print(f"Warning: Gemini response for summary was empty or blocked. Prompt finish reason: {response.prompt_feedback.block_reason if response.prompt_feedback else 'N/A'}. Fallback.")
                 raise ValueError("Empty or blocked response")

            # Enforce character limit strictly post-generation as a fallback
            if len(summary) > max_chars:
                print(f"Warning: Gemini summary exceeded {max_chars} chars ({len(summary)}). Truncating.")
                # Find last space before limit for cleaner truncation
                truncated_summary = summary[:max_chars]
                last_space = truncated_summary.rfind(' ')
                if last_space > max_chars * 0.8: # Only truncate at space if it's reasonably close
                    summary = truncated_summary[:last_space] + "..."
                else:
                    summary = truncated_summary
            elif not summary.strip(): # Handle empty string summary
                 print("Warning: Gemini summary was an empty string. Fallback.")
                 raise ValueError("Empty summary string")

            return summary # Success

        except Exception as e:
            print(f"  Error summarizing with Gemini (Attempt {attempt + 1}/{retries + 1}): {e}")
            if attempt < retries:
                print(f"  Retrying in {delay} seconds...")
                time.sleep(delay)
            else:
                print(f"  Summarization failed after {retries + 1} attempts. Falling back to simple truncation.")
                # Fallback to simple truncation on final failure
                return text[:max_chars] + ("..." if len(text) > max_chars else "")

    # Should not be reached if fallback works, but included for safety
    return text[:max_chars] + ("..." if len(text) > max_chars else "")


def analyze_single_post(submission):
    """Analyzes comments for a single PRAW submission object."""
    # ... (Comment analysis logic remains the same) ...
    print(f"Analyzing comments for post: {submission.id} - {submission.title[:50]}...")
    counts = {"YTA": 0, "NTA": 0, "ESH": 0, "NAH": 0, "INFO": 0, "TotalJudged": 0}
    processed_comments = 0
    try:
        submission.comment_sort = 'top'
        submission.comments.replace_more(limit=None, threshold=15)
        for comment in submission.comments.list():
            if processed_comments >= COMMENT_LIMIT_PER_POST: break
            if isinstance(comment, praw.models.Comment) and comment.body:
                category = categorize_comment(comment.body)
                if category:
                    counts[category] += 1
                    counts["TotalJudged"] += 1
                processed_comments += 1
    except praw.exceptions.APIException as e:
         print(f"  PRAW API Exception processing comments for post {submission.id}: {e}")
    except Exception as e:
        print(f"  General Error processing comments for post {submission.id}: {e}")

    # ... (Majority verdict logic remains the same) ...
    majority_verdict = "Mixed"
    highest_count = 0
    verdict_candidates = ["YTA", "NTA", "ESH", "NAH"]
    if counts["TotalJudged"] > 0:
        for cat in verdict_candidates:
            if counts[cat] > highest_count:
                highest_count = counts[cat]
                majority_verdict = cat
        if counts["TotalJudged"] < 10: majority_verdict = "Mixed / Few Judgments"
        elif (highest_count / counts["TotalJudged"]) < 0.40: majority_verdict = "Mixed"
    else:
        majority_verdict = "No Judgments Found"

    print(f"  Finished comment analysis for {submission.id}. Judged comments: {counts['TotalJudged']}")
    return counts, majority_verdict


def get_top_posts_and_analyze(reddit):
    """Fetches top posts, analyzes comments, and summarizes body using Gemini."""
    subreddit = reddit.subreddit(SUBREDDIT_NAME)
    analyzed_posts = []
    print(f"Fetching top {NUM_POSTS} posts from r/{SUBREDDIT_NAME} (time_filter='day')...")
    try:
        top_submissions = list(subreddit.top(time_filter='day', limit=NUM_POSTS))
    except Exception as e:
        print(f"Error fetching top submissions: {e}")
        return []

    print(f"Fetched {len(top_submissions)} submissions. Analyzing and Summarizing...")

    for submission in top_submissions:
        submission_text = submission.selftext or "" # Ensure we have text or empty string
        # Filter out posts more strictly
        if submission.stickied or not submission_text or submission_text in ('[removed]', '[deleted]'):
            print(f"Skipping post: {submission.id} (Stickied, No/Removed/Deleted Selftext)")
            continue

        counts, majority_verdict = analyze_single_post(submission)

        # --- Generate Summary with Gemini ---
        print(f"Summarizing post: {submission.id} with Gemini Flash...")
        body_summary = summarize_with_gemini(submission_text) # Call new function
        # --- End Summary ---

        post_data = {
            "id": submission.id,
            "title": submission.title,
            "url": submission.permalink,
            "body_summary": body_summary, # Use the generated summary
            "reddit_judgments": counts,
            "total_judged": counts.get("TotalJudged", 0),
            "reddit_verdict": majority_verdict,
            "fetched_utc": datetime.utcnow().isoformat()
        }
        analyzed_posts.append(post_data)
        # Optional: Add a small delay between posts to respect API rate limits if needed
        # time.sleep(1)

    return analyzed_posts

def main():
    """Main function to run the scraper and save JSON."""
    print("--- Starting AITA Daily Top Posts Scraper (using Gemini Flash) ---")
    start_time = datetime.now()
    try:
        # Configure Gemini first (reads API key from env)
        configure_gemini()

        reddit = setup_reddit_api() # Setup Reddit API (reads keys from env)
        analyzed_data = get_top_posts_and_analyze(reddit)

        if analyzed_data:
            script_dir = os.path.dirname(os.path.abspath(__file__))
            output_path = os.path.join(script_dir, OUTPUT_JSON_FILE)
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(analyzed_data, f, indent=4, ensure_ascii=False)
            print(f"\nSuccessfully saved analysis for {len(analyzed_data)} posts to {output_path}")
        else:
            print("\nNo data analyzed or saved.")

    except Exception as e:
        print(f"\nAn critical error occurred during the process: {e}")
        import traceback
        traceback.print_exc() # Print full traceback for debugging

    end_time = datetime.now()
    print(f"--- Script finished in {end_time - start_time} ---")

if __name__ == "__main__":
    main()