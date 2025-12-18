# Open Graph Preview for Event Links

This project now serves per-event OG HTML at `GET /api/v1/og/events/:id`.
Use the following Nginx config to let preview bots (LINE/FB/WA/Slack/Twitter) fetch OG while normal users still load the SPA.

```
map $http_user_agent $is_preview_bot {
    default 0;
    ~*Line 1;
    ~*LineBot 1;
    ~*facebookexternalhit 1;
    ~*Twitterbot 1;
    ~*Slackbot 1;
    ~*WhatsApp 1;
    ~*TelegramBot 1;
    ~*Discordbot 1;
    ~*LinkedInBot 1;
}

server {
    # ... existing server config ...

    location ~ ^/events/([^/?#]+)/?$ {
        if ($is_preview_bot) {
            rewrite ^/events/([^/?#]+)/?$ /api/v1/og/events/$1?$args last;
        }
        try_files $uri /index.html;
    }
}
```

Validation:
```
curl -H "User-Agent: LineBot" "https://test.socialmore.jp/events/<eventId>?from=line_share"
```
should return HTML with `og:title`, `og:image`, etc. Normal browsers still load the SPA.
