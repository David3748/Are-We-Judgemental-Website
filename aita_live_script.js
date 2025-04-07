document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const postsContainer = document.getElementById('live-posts-container');
    const submitButton = document.getElementById('submit-live-judgments');
    const resultsSummaryDiv = document.getElementById('live-results-summary');
    const resultsContentDiv = document.getElementById('results-content');
    const dataTimestampSpan = document.getElementById('data-last-updated');

    // --- State Variables ---
    let loadedPostsData = [];
    let userToken = null;
    let hasSubmitted = false; // --- NEW: Flag to prevent multiple submissions ---

    // --- LocalStorage Key ---
    const USER_TOKEN_KEY = 'aitaUserToken';

    // --- Google Form Configuration (Populated from User HTML) ---
    const GOOGLE_FORM_ACTION_URL = "https://docs.google.com/forms/d/e/1FAIpQLSfrN1KXhkWfHIaPZXlt1eBKomGf_G0YwsmMaKr2wMTbhIuhnw/formResponse";
    const ENTRY_IDS = {
        // NEW FIELD from form HTML:
        userToken: "entry.1891712537",        // Corresponds to "UserToken" question

        // IDs from previous correct extraction (based on your form structure):
        postID: "entry.1279077345",         // Corresponds to "PostID" question
        userJudgment: "entry.522832524",    // Corresponds to "UserJudgment" question
        redditVerdict: "entry.2085620116",  // Corresponds to "RedditVerdict" question
        agreed: "entry.1129841342",         // Corresponds to "AgreedWithMajority" question
        userYTA_count: "entry.819958711",   // Corresponds to "UserYTA" question
        userNTA_count: "entry.1159463763",  // Corresponds to "UserNTA" question
        userESH_count: "entry.1798430888",  // Corresponds to "UserESH" question
        userNAH_count: "entry.1154907513",  // Corresponds to "UserNAH" question
        userINFO_count: "entry.1211055051", // Corresponds to "UserINFO" question
        popAlignPercent: "entry.496798247", // Corresponds to "PopularityAlignmentPercent" question
        // answeredCount: "entry.YOUR_ANSWEREDCOUNT_ID", // Still omitted as per previous step
        timestamp: "entry.2023000441"         // Corresponds to "Timestamp" question
    };
    // --- END Google Form Configuration ---


    // --- Generate/Retrieve Unique User Token ---
    function initializeUserToken() {
        try {
            let storedToken = localStorage.getItem(USER_TOKEN_KEY);
            if (storedToken && storedToken.length > 10) {
                userToken = storedToken;
                console.log("Retrieved user token from localStorage:", userToken);
            } else {
                if (window.crypto && window.crypto.randomUUID) {
                    userToken = crypto.randomUUID();
                    localStorage.setItem(USER_TOKEN_KEY, userToken);
                    console.log("Generated and stored new user token:", userToken);
                } else {
                    userToken = `fallback-${Date.now()}-${Math.random().toString(36).substring(2)}`;
                    console.warn("crypto.randomUUID not supported, using fallback token:", userToken);
                     localStorage.setItem(USER_TOKEN_KEY, userToken);
                }
            }
        } catch (e) {
             console.error("Error accessing localStorage or generating token:", e);
             userToken = `error-${Date.now()}-${Math.random().toString(36).substring(2)}`;
             console.log("Using temporary session token due to error:", userToken);
        }
    }
    // --- END User Token Logic ---


    // --- Fetch and Display Posts ---
    async function loadPosts() {
        try {
            const response = await fetch(`top_aita_posts.json?v=${new Date().getTime()}`);
            console.log("Fetch response status:", response.status);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            let rawPostsData = await response.json();
            console.log(`Successfully parsed JSON. Found ${rawPostsData?.length ?? 0} raw posts.`);
            if (!rawPostsData || rawPostsData.length === 0) throw new Error("No post data found.");

            // Pre-calculate percentages and ensure fields
            loadedPostsData = rawPostsData.map((post, index) => {
                if (!post || typeof post !== 'object') return null;
                const counts = post.reddit_judgments || {};
                const total = post.total_judged || 0;
                const percentages = {};
                const categories = ["YTA", "NTA", "ESH", "NAH", "INFO"];
                categories.forEach(cat => { percentages[cat] = total > 0 ? ((counts[cat] || 0) / total) * 100 : 0; });
                return { ...post, id: post.id || `missing-id-${index}`, title: post.title || '(Missing Title)', url: post.url || '#', body_summary: post.body_summary || '', reddit_percentages: percentages, reddit_verdict: post.reddit_verdict || "Mixed", total_judged: total, reddit_judgments: counts };
            }).filter(post => post !== null);

            console.log(`Processed ${loadedPostsData.length} valid posts.`);

            // Display timestamp
            if (loadedPostsData.length > 0 && loadedPostsData[0]?.fetched_utc) {
                try { dataTimestampSpan.textContent = new Date(loadedPostsData[0].fetched_utc).toLocaleString(); }
                catch (e) { dataTimestampSpan.textContent = "Unknown"; }
            } else { dataTimestampSpan.textContent = "Unknown"; }

            if (loadedPostsData.length > 0) {
                displayPosts();
                submitButton.style.display = 'block';
                hasSubmitted = false; // Reset submission flag on new load
                submitButton.disabled = false; // Re-enable button
                submitButton.style.opacity = '1'; // Restore opacity
            } else {
                 postsContainer.innerHTML = '<p>No valid posts found after processing.</p>';
            }

        } catch (error) {
            console.error('Error loading or processing post data:', error);
            postsContainer.innerHTML = `<p>Error loading posts: ${error.message}. Check console and JSON file.</p>`;
        }
    }

    // (displayPosts function remains the same)
    function displayPosts() {
        postsContainer.innerHTML = '';
        const judgmentTypes = ["YTA", "NTA", "ESH", "NAH", "INFO"];
        console.log(`Attempting to display ${loadedPostsData.length} posts.`);

        loadedPostsData.forEach((post, index) => {
            try {
                const postElement = document.createElement('div');
                postElement.className = 'live-post';
                postElement.setAttribute('data-post-id', post.id);

                const titleLink = `https://www.reddit.com${post.url || '#'}`;
                const titleHtml = `<h3><a href="${titleLink}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.title)}</a></h3>`;
                const bodyHtml = `<div class="live-post-body">${escapeHtml(post.body_summary)}</div>`;

                let optionsHtml = '<div class="judgment-options">';
                const groupName = `judgment-${post.id}`;
                judgmentTypes.forEach(type => {
                     const radioId = `post-${post.id}-${type}`;
                     optionsHtml += `<label for="${radioId}"><input type="radio" name="${groupName}" id="${radioId}" value="${type}"><span>${type}</span></label>`;
                });
                optionsHtml += '</div>';

                postElement.innerHTML = titleHtml + bodyHtml + optionsHtml;
                postsContainer.appendChild(postElement);

                const radioButtons = postElement.querySelectorAll(`input[name="${groupName}"]`);
                if (radioButtons.length > 0) {
                    radioButtons.forEach(radio => { radio.addEventListener('change', handleRadioChange); });
                } else { console.warn(`No radio buttons found for post ${post.id}`); }

            } catch (renderError) {
                console.error(`Error rendering post index ${index}, ID: ${post.id}`, renderError);
                // Display error message for this post
            }
        });
        console.log("Finished displaying posts loop.");
    }

    // (handleRadioChange function remains the same)
    function handleRadioChange(event) {
        const changedRadio = event.target;
        const groupName = changedRadio.name;
        const groupRadios = document.querySelectorAll(`input[name="${groupName}"]`);
        groupRadios.forEach(radio => {
            const label = radio.closest('label');
            if (label) {
                if (radio.checked) label.classList.add('label-selected');
                else label.classList.remove('label-selected');
            }
        });
    }

    // --- Function to Send Data to Google Form ---
    async function sendDataToGoogleForm(data) {
        // Basic config checks
        if (!GOOGLE_FORM_ACTION_URL || GOOGLE_FORM_ACTION_URL.includes("YOUR_LONG_FORM_ID_HERE") ||
            !ENTRY_IDS.postID || ENTRY_IDS.postID.includes("YOUR_POSTID_ENTRY_ID") ||
            !ENTRY_IDS.userToken || ENTRY_IDS.userToken.includes("YOUR_USER_TOKEN_ENTRY_ID_HERE")) {
             console.warn("Google Form URL or required Entry IDs (postID, userToken) not configured correctly. Skipping submission.");
             return;
        }

        const formData = new FormData();
        const appendIfExists = (key, value) => {
             if (ENTRY_IDS[key] && value !== undefined && value !== null) {
                 formData.append(ENTRY_IDS[key], value);
             } else if (ENTRY_IDS[key]) {
                 formData.append(ENTRY_IDS[key], '');
             }
        };

        // Append user token first
        appendIfExists('userToken', data.userToken);

        // Append other data points
        appendIfExists('postID', data.postID);
        appendIfExists('userJudgment', data.userJudgment);
        appendIfExists('redditVerdict', data.redditVerdict);
        appendIfExists('agreed', data.agreed);
        appendIfExists('popAlignPercent', data.popAlignPercent?.toFixed(1));
        appendIfExists('timestamp', data.timestamp || new Date().toISOString());

        // Append aggregate counts
        const userCounts = data.userCategoryCounts || {};
        appendIfExists('userYTA_count', userCounts.YTA);
        appendIfExists('userNTA_count', userCounts.NTA);
        appendIfExists('userESH_count', userCounts.ESH);
        appendIfExists('userNAH_count', userCounts.NAH);
        appendIfExists('userINFO_count', userCounts.INFO);

        // Append answeredCount if field exists
        if (ENTRY_IDS.answeredCount) {
             appendIfExists('answeredCount', data.totalAnsweredInSession);
        }

        try {
            await fetch(GOOGLE_FORM_ACTION_URL, {
                method: "POST",
                mode: "no-cors",
                body: formData
            });
        } catch (error) {
            console.error(`Error submitting data to Google Form for post ID ${data.postID}:`, error);
        }
    }
    // --- END Google Form Function ---

    // --- Handle Submission and Analysis ---
    submitButton.addEventListener('click', async () => {
        // --- Prevent Multiple Submissions ---
        if (hasSubmitted) {
             console.log("Analysis already submitted for this session.");
             alert("You have already submitted your analysis for this set of posts.");
             return;
        }
        // --- End Prevention ---

        console.log("Analysis started. Preparing data for submission.");

        let userJudgments = {};
        let answeredCount = 0;
        let agreementCount = 0;
        let totalPopularityPercent = 0;
        let userCategoryCounts = { YTA: 0, NTA: 0, ESH: 0, NAH: 0, INFO: 0 };
        let redditCategoryTotals = { YTA: 0, NTA: 0, ESH: 0, NAH: 0, INFO: 0, TotalJudged: 0 };
        let harshMismatches = 0;
        let softMismatches = 0;

        const batchSubmissionData = [];

        // --- Collect Judgments & Prepare Batch ---
        loadedPostsData.forEach(post => {
            const selected = document.querySelector(`input[name="judgment-${post.id}"]:checked`);
            if (selected) {
                const userChoice = selected.value;
                userJudgments[post.id] = userChoice;
                answeredCount++;
                userCategoryCounts[userChoice]++;

                const agreed = userChoice === post.reddit_verdict;
                if (agreed) { agreementCount++; }

                let popAlign = 0;
                if (post.reddit_percentages && post.reddit_percentages[userChoice] !== undefined) {
                    popAlign = post.reddit_percentages[userChoice];
                    totalPopularityPercent += popAlign;
                }

                // Prepare data FOR THIS POST for Google Form batch
                 const postSubmissionData = {
                     userToken: userToken, // Add the generated/retrieved token
                     postID: post.id,
                     userJudgment: userChoice,
                     redditVerdict: post.reddit_verdict,
                     agreed: agreed ? 'Yes' : 'No',
                     popAlignPercent: popAlign,
                     timestamp: new Date().toISOString()
                 };
                 batchSubmissionData.push(postSubmissionData);

                // Accumulate Reddit totals & calculate mismatches
                const judgments = post.reddit_judgments || {};
                for (const cat in redditCategoryTotals) { /* ... accumulate ... */ }
                redditCategoryTotals.TotalJudged += post.total_judged || 0;
                if (!agreed) { /* ... calculate mismatch type ... */ }

            } else {
                userJudgments[post.id] = null;
            }
        }); // End of loadedPostsData.forEach

        if (answeredCount === 0) {
            alert("Please judge at least one post before analyzing.");
            return;
        }

        // --- Disable Button & Set Flag BEFORE Sending Data ---
        hasSubmitted = true;
        submitButton.disabled = true;
        submitButton.style.opacity = '0.6'; // Visually indicate disabled
        submitButton.textContent = 'Submitting...';
        // --- End Disable ---

        // --- Send Batched Data to Google Forms ---
        console.log(`Attempting to submit data for ${batchSubmissionData.length} judged posts (User Token: ${userToken})...`);
        try {
            for (const data of batchSubmissionData) {
                // Add final aggregate data just before sending
                data.userCategoryCounts = userCategoryCounts;
                data.totalAnsweredInSession = answeredCount;
                await sendDataToGoogleForm(data);
                await new Promise(resolve => setTimeout(resolve, 50)); // Optional small delay
            }
            console.log("Finished attempting data submission.");
            submitButton.textContent = 'Analysis Submitted!'; // Update button text on success
        } catch (submissionError) {
            console.error("Error during batch submission:", submissionError);
            submitButton.textContent = 'Submission Error'; // Indicate error
             // Optionally re-enable button on error? Or keep disabled?
             // hasSubmitted = false; // Allow retry?
             // submitButton.disabled = false;
             // submitButton.style.opacity = '1';
        }
        // --- End Send Data ---


        // --- Generate Results HTML (Remains the same) ---
        let resultsHtml = `<p>You judged ${answeredCount} out of ${loadedPostsData.length} available posts.</p>`;
        // ... (Agreement Score, Popularity, Profile, Disagreement, Tendency sections) ...
        const agreementPercentage = (answeredCount > 0) ? (agreementCount / answeredCount) * 100 : 0;
        resultsHtml += `<h4>Verdict Agreement</h4><p>You agreed with the Reddit majority verdict on <strong>${agreementCount} (${agreementPercentage.toFixed(1)}%)</strong> of the posts you judged.</p>`;
        const averagePopularityAlignment = (answeredCount > 0) ? totalPopularityPercent / answeredCount : 0;
        resultsHtml += `<h4>Popularity Alignment</h4><p>On average, your specific judgment matched the opinion of <strong>${averagePopularityAlignment.toFixed(1)}%</strong> of Reddit commenters...</p>`; // Truncated
        resultsHtml += `<h4>Your Judgment Profile</h4>`;
        if (answeredCount > 0 && redditCategoryTotals.TotalJudged > 0) { /* ... profile list ... */ } else { /* ... cannot calculate ... */ }
        resultsHtml += `<h4>Disagreement Style</h4>`;
        const disagreementCount = answeredCount - agreementCount;
        if (disagreementCount > 0) { /* ... mismatch list ... */ } else if (answeredCount > 0) { /* ... agreed on all ... */ } else { /* ... no posts judged ... */ }
        resultsHtml += `<h4>Overall Judgmental Tendency...</h4>`;
        if (answeredCount > 0 && (userCategoryCounts['NTA'] > 0 || userCategoryCounts['YTA'] > 0)) { /* ... ratio comparison ... */ } else { /* ... cannot calculate ... */ }
        // --- End Generate Results HTML ---


        // Display results
        resultsContentDiv.innerHTML = resultsHtml;
        resultsSummaryDiv.style.display = 'block';
        resultsSummaryDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }); // --- End Submit Button Listener ---


    // --- Utility Functions ---
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
             console.warn("escapeHtml received non-string input:", unsafe);
             return '(Content missing or invalid)';
        }
        return unsafe.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, "'").replace(/'/g, "'");
     }

     function getRelativeJudgment(userRatio, groupRatio, tolerance = 0.20) {
        if (userRatio === Infinity) { return groupRatio === Infinity ? "similarly" : "more"; }
        if (groupRatio === Infinity) { return "less"; }
        if (groupRatio === 0) { return userRatio > 0 ? "more" : "similarly"; }
        if (userRatio > groupRatio * (1 + tolerance)) { return "more"; }
        else if (userRatio < groupRatio * (1 - tolerance)) { return "less"; }
        else { return "similarly"; }
    }

    // --- Initial Load ---
    initializeUserToken(); // Generate/retrieve token first
    loadPosts(); // Then load posts

}); // End of DOMContentLoaded listener