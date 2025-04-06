document.addEventListener('DOMContentLoaded', () => {
    const submitButton = document.getElementById('submit-judgments');
    const resultsDiv = document.getElementById('interactive-results');
    const form = document.getElementById('judgment-form');

    // --- Study Data (from Tables 2-6) ---
    // Store counts for easier access: { NTA: count, Neither: count, YTA: count }
    const studyData = {
        wedding: {
            reddit: { NTA: 108, Neither: 16, YTA: 92 },
            student: { NTA: 279, Neither: 115, YTA: 58 }
        },
        cat: {
            reddit: { NTA: 291, Neither: 253, YTA: 203 },
            student: { NTA: 193, Neither: 177, YTA: 88 }
        },
        child_support: {
            reddit: { NTA: 75, Neither: 13, YTA: 146 },
            student: { NTA: 278, Neither: 120, YTA: 51 }
        },
        plane: {
            reddit: { NTA: 453, Neither: 127, YTA: 575 },
            student: { NTA: 86, Neither: 191, YTA: 177 }
        },
        trust_fund: {
            reddit: { NTA: 33, Neither: 5, YTA: 27 },
            student: { NTA: 220, Neither: 156, YTA: 83 }
        }
    };

    // --- Helper Function to Calculate Percentages ---
    function getPercentages(counts) {
        const total = counts.NTA + counts.Neither + counts.YTA;
        if (total === 0) return { NTA: 0, Neither: 0, YTA: 0 };
        return {
            NTA: ((counts.NTA / total) * 100).toFixed(1),
            Neither: ((counts.Neither / total) * 100).toFixed(1),
            YTA: ((counts.YTA / total) * 100).toFixed(1)
        };
    }

    // --- Event Listener for Button Click ---
    submitButton.addEventListener('click', () => {
        resultsDiv.innerHTML = '<h3>Your Comparison:</h3>'; // Clear previous results
        let resultsHtml = '';
        let answeredCount = 0;

        const formData = new FormData(form);
        const userAnswers = {
            wedding: formData.get('wedding'),
            cat: formData.get('cat'),
            child_support: formData.get('child_support'),
            plane: formData.get('plane'),
            trust_fund: formData.get('trust_fund')
        };

        // Process each question
        for (const question in userAnswers) {
            const userAnswer = userAnswers[question];
            if (userAnswer) { // Only process if answered
                answeredCount++;
                const questionData = studyData[question];
                const redditPercentages = getPercentages(questionData.reddit);
                const studentPercentages = getPercentages(questionData.student);

                resultsHtml += `<p><strong>${capitalizeFirstLetter(question.replace('_', ' '))} Question:</strong> You chose <strong>${userAnswer}</strong>.</p><ul>`;
                resultsHtml += `<li>Redditors judged ${userAnswer}: ${redditPercentages[userAnswer]}%</li>`;
                resultsHtml += `<li>Students judged ${userAnswer}: ${studentPercentages[userAnswer]}%</li>`;
                resultsHtml += `</ul>`;

            }
        }

        if (answeredCount === 0) {
             resultsHtml = '<p>Please answer at least one question to see the comparison.</p>';
        }

        resultsDiv.innerHTML += resultsHtml; // Append generated HTML
        resultsDiv.style.display = 'block'; // Show results
    });

    // Helper to capitalize question names nicely
    function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }
});