import praw
import pandas as pd # Note: Pandas isn't strictly needed anymore for this version but keep if you might add other analysis later
import re
import os
import json
from datetime import datetime, timedelta

# --- Configuration ---
CLIENT_ID = "_kYkXz5MQm6v1OaZH2SVfg" # Your Client ID
CLIENT_SECRET = "h6-t-KJLXfiWi61bTn3l8w796SyhDA" # Your Client Secret
USER_AGENT = "AITAScraperDaily:v1.0 (by /u/Dndelephant)" # Descriptive User Agent
SUBREDDIT_NAME = "AmItheAsshole"
NUM_POSTS = 20 # Number of top posts to fetch
COMMENT_LIMIT_PER_POST = 200 # Limit comments analyzed per post (balance speed/accuracy)
OUTPUT_JSON_FILE = "top_aita_posts.json" # File to be used by the website

# --- Functions (adapted from original) ---

def setup_reddit_api():
    """Initializes and returns a PRAW Reddit instance."""
    # Consider reading credentials from environment variables or a config file
    # for better security rather than hardcoding them.
    reddit = praw.Reddit(
        client_id=os.environ.get('REDDIT_CLIENT_ID', CLIENT_ID),
        client_secret=os.environ.get('REDDIT_CLIENT_SECRET', CLIENT_SECRET),
        user_agent=USER_AGENT,
        read_only=True # Important for scraping public data
    )
    print(f"PRAW Read-Only Mode: {reddit.read_only}")
    return reddit

def categorize_comment(comment_text):
    """Categorizes comment based on AITA acronyms."""
    if not comment_text: return None
    text_lower = comment_text.lower()
    # Prioritize specific judgments over INFO
    if re.search(r'\byta\b', text_lower): return "YTA"
    if re.search(r'\bnta\b', text_lower): return "NTA"
    if re.search(r'\besh\b', text_lower): return "ESH"
    if re.search(r'\bnah\b', text_lower): return "NAH"
    if re.search(r'\binfo\b', text_lower): return "INFO" # INFO last
    return None

def analyze_single_post(submission):
    """Analyzes comments for a single PRAW submission object."""
    print(f"Analyzing comments for post: {submission.id} - {submission.title[:50]}...")
    counts = {"YTA": 0, "NTA": 0, "ESH": 0, "NAH": 0, "INFO": 0, "TotalJudged": 0}
    processed_comments = 0

    try:
        # Use submission.comments directly for potentially better performance
        submission.comment_sort = 'top' # Often judgments are in top comments
        # Increase threshold slightly, maybe it helps catch edge cases? limit=None is fine.
        submission.comments.replace_more(limit=None, threshold=15)

        for comment in submission.comments.list():
            if processed_comments >= COMMENT_LIMIT_PER_POST:
                break
            # Check if it's a Comment and not MoreComments
            if isinstance(comment, praw.models.Comment) and comment.body:
                category = categorize_comment(comment.body)
                if category:
                    counts[category] += 1
                    counts["TotalJudged"] += 1
                processed_comments += 1
            elif isinstance(comment, praw.models.MoreComments):
                # Optionally try to load more, but often limited; avoid infinite loops
                # print(f"  Skipping MoreComments object for post {submission.id}")
                pass


    except praw.exceptions.APIException as e:
         print(f"  PRAW API Exception processing comments for post {submission.id}: {e}")
         # Allow script to continue with next post
    except Exception as e:
        print(f"  General Error processing comments for post {submission.id}: {e}")
        # Continue analysis with potentially fewer comments

    # Determine majority verdict (simple version)
    majority_verdict = "Mixed"
    highest_count = 0
    # Only consider YTA, NTA, ESH, NAH for primary verdict
    verdict_candidates = ["YTA", "NTA", "ESH", "NAH"]
    if counts["TotalJudged"] > 0: # Only determine verdict if judgments exist
        for cat in verdict_candidates:
            if counts[cat] > highest_count:
                highest_count = counts[cat]
                majority_verdict = cat

        # Handle ties or low counts - maybe require a certain percentage?
        if counts["TotalJudged"] < 10: # If very few judgments, call it Mixed
             majority_verdict = "Mixed / Few Judgments"
        # Check if highest count meets a threshold percentage (e.g., 40%)
        elif (highest_count / counts["TotalJudged"]) < 0.40:
             majority_verdict = "Mixed"
    else:
        majority_verdict = "No Judgments Found"


    print(f"  Finished {submission.id}. Judged comments: {counts['TotalJudged']}")
    return counts, majority_verdict


def get_top_posts_and_analyze(reddit):
    """Fetches top posts from the subreddit and analyzes each."""
    subreddit = reddit.subreddit(SUBREDDIT_NAME)
    analyzed_posts = []

    print(f"Fetching top {NUM_POSTS} posts from r/{SUBREDDIT_NAME} (time_filter='day')...")
    try:
        # Fetching top posts from the last 24 hours
        top_submissions = list(subreddit.top(time_filter='day', limit=NUM_POSTS))
    except Exception as e:
        print(f"Error fetching top submissions: {e}")
        return []

    print(f"Fetched {len(top_submissions)} submissions. Analyzing comments...")

    for submission in top_submissions:
        # Basic filtering (e.g., ignore mod posts, check for selftext)
        # Added check for removed/deleted posts
        if submission.stickied or not submission.selftext or submission.selftext == '[removed]' or submission.selftext == '[deleted]':
            print(f"Skipping post: {submission.id} (Stickied, No Selftext, Removed, or Deleted)")
            continue

        # --- Analyze the post ---
        counts, majority_verdict = analyze_single_post(submission) # counts contains TotalJudged

        # --- Format data for JSON ---
        body_summary = submission.selftext
        if len(body_summary) > 800: # Limit summary length
             body_summary = body_summary[:800] + "..."

        post_data = {
            "id": submission.id,
            "title": submission.title,
            "url": submission.permalink, # Relative URL is useful
            "body_summary": body_summary,
            "reddit_judgments": counts, # Pass the whole counts dict
            "total_judged": counts.get("TotalJudged", 0), # *** EXPLICITLY ADDED ***
            "reddit_verdict": majority_verdict,
            "fetched_utc": datetime.utcnow().isoformat()
        }
        analyzed_posts.append(post_data)

    return analyzed_posts

def main():
    """Main function to run the scraper and save JSON."""
    print("--- Starting AITA Daily Top Posts Scraper ---")
    start_time = datetime.now()

    try:
        reddit = setup_reddit_api()
        analyzed_data = get_top_posts_and_analyze(reddit)

        if analyzed_data:
            # Save data to JSON file
            # Use the current script directory for the output file path
            script_dir = os.path.dirname(os.path.abspath(__file__))
            output_path = os.path.join(script_dir, OUTPUT_JSON_FILE)

            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(analyzed_data, f, indent=4, ensure_ascii=False)
            print(f"\nSuccessfully saved analysis for {len(analyzed_data)} posts to {output_path}")
        else:
            print("\nNo data analyzed or saved.")

    except Exception as e:
        print(f"\nAn error occurred during the process: {e}")
        import traceback
        traceback.print_exc() # Print full traceback for debugging

    end_time = datetime.now()
    print(f"--- Script finished in {end_time - start_time} ---")


if __name__ == "__main__":
    main()