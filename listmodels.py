import google.generativeai as genai
import os
import traceback

print("--- Listing Available Google Generative AI Models ---")

# 1. Configure API Key from Environment Variable
try:
    api_key = 'RickAstley'
    if not api_key:
        raise ValueError("Error: GOOGLE_API_KEY environment variable not set.")
    genai.configure(api_key=api_key)
    print("SDK Configured successfully.")
except Exception as config_err:
    print(f"\nCritical Error configuring Google AI SDK: {config_err}")
    print("Ensure the GOOGLE_API_KEY environment variable is correctly set.")
    exit(1) # Exit if configuration fails

# 2. List Models
print("\nFetching available models...")
try:
    model_count = 0
    found_flash = False
    for m in genai.list_models():
        model_count += 1
        # Check specifically if it supports the method used in the main script
        supports_generate = 'generateContent' in m.supported_generation_methods

        print("-" * 20)
        print(f"Model Name:          {m.name}")
        print(f"  Display Name:      {m.display_name}")
        print(f"  Supports Generate: {supports_generate}")
        print(f"  Supported Methods: {m.supported_generation_methods}")

        # Highlight the likely correct model
        if "gemini-1.5-flash" in m.name and supports_generate:
            print("  ✨ Found potential Flash model!")
            found_flash = True

    print("-" * 20)
    print(f"\nFound {model_count} models total.")
    if not found_flash:
        print("\nWarning: Did not find a model containing 'gemini-1.5-flash' that supports 'generateContent'.")
    elif 'models/gemini-1.5-flash-latest' in [m.name for m in genai.list_models()]:
         print("\nConfirmed: 'models/gemini-1.5-flash-latest' is available and likely the correct choice.")
    else:
         print("\nNote: 'models/gemini-1.5-flash-latest' specifically was not listed, but other flash variants might exist.")


except Exception as list_err:
    print(f"\nError occurred while listing models: {list_err}")
    traceback.print_exc()

print("\n--- Script finished ---")