import os

# Define the Facebook page URL
page_url = "https://www.facebook.com/WillSmith/"

# Execute the snscrape command to retrieve posts
os.system(f"snscrape facebook-page {page_url} > posts.txt 2>/dev/null")

# Posts are saved in the 'posts.txt' file
print(f"Posts from '{page_url}' have been saved to 'posts.txt'.")