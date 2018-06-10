---
title: NAS 외부 접속 https 지원하기
date: 2017-03-05 04:06:35
tag: 
- NAS
- https
category: 개발자팁
---
저렴한 NAS를 찾다가 작년부터 IPTIME의 NAS-IIe를 사용해 왔다. 기존에 ipdisk 도메인을 이용하여 외부 접속을 사용하고 있었는데 크롬에서 HTTPS를 지원하지 않으면 경고 메시지를 띄우는 게 마음에 걸렸다. ipdisk 도메인은 내 소유가 아니라서 https를 지원하려면 내가 소유한 서브도메인으로 SSL 프록시를 하는게 좋을 것 같아 시도해 보았다.

## 목차
* [SSL 클라이언트 인증서 발급](#ssl-cert)
* [NGINX로 SSL 리버스 프록시 설정](#nginx-ssl)
* [Upstream 설정](#upstream)
* [완성된 NGINX 설정 예시](#example)

## <a name="ssl-cert"></a>SSL 클라이언트 인증서 발급
보안서버를 구축하려면 https를 지원해야 하고 https를 지원하려면 SSL 인증서라는 것을 발급받아야 한다. 보통 SSL 인증서는 유료이고 가격이 꽤 비싸다. 그러나 https의 확산을 위해 SSL 인증서를 무료로 보급하는 프로젝트가 있었는데, 그게 바로 <u>[Let's Encrypt](https://letsencrypt.org/)</u>다.  

리눅스에서는 Let's Encrypt에서 제공하는 소프트웨어 클라이언트인 letsencrypt를 사용하면 쉽고 편하게 적용할 수 있다. 그러나 무료인 대신 갱신주기가 유료서비스에 비해 짧고, 만료되기 전에 인증서를 갱신해야 한다.

Let's Encrypt 인증서를 발급 받는 자세한 방법은 Outsider님의 글을 참고하길 바란다.

**[Lets' Encrypt로 무료로 HTTPS 지원하기, Outsider's Dev Story](https://blog.outsider.ne.kr/1178)**

## <a name="nginx-ssl"></a>NGINX로 SSL 리버스 프록시 설정
알아 보니 NGINX로 SSL 리버스 프록시를 지원하는 게 가장 빠르고 쉬운 방법 같았다.
> 리버스 프록시란  
> 클라이언트는 프록시로 요청하고,  
> 프록시가 배후(reverse)의 서버로부터 데이터를 가져오는 방식을 말한다.

{% asset_img "proxy.png" "reverse_proxy" %}

앞 단 서버를 프록시로 두고 내부에서 데이터를 주고 받고, 리퀘스트를 받아서 넘겨 주는 구조다. NGINX애서는 리버스 프록시를 어떻게 설정해야 할까? 먼저 앞서 발급받은 SSL 클라이언트 인증서 및 NGINX 인증할 키를 추가한다.  

``` Nginx
server {
    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ...
}
```

선택사항으로 SSL 프로토콜과 암호를 지정할 수 있다.

``` Nginx
server {
    ...
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
    ssl_ciphers 'ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES128-SHA256:ECDHE-RSA-AES128-SHA256:ECDHE-ECDSA-AES128-SHA:ECDHE-RSA-AES256-SHA384:ECDHE-RSA-AES128-SHA:ECDHE-ECDSA-AES256-SHA384:ECDHE-ECDSA-AES256-SHA:ECDHE-RSA-AES256-SHA:DHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA:DHE-RSA-AES256-SHA256:DHE-RSA-AES256-SHA:ECDHE-ECDSA-DES-CBC3-SHA:ECDHE-RSA-DES-CBC3-SHA:EDH-RSA-DES-CBC3-SHA:AES128-GCM-SHA256:AES256-GCM-SHA384:AES128-SHA256:AES256-SHA256:AES128-SHA:AES256-SHA:DES-CBC3-SHA:!DSS';
    ssl_prefer_server_ciphers on;
}
```

그리고 프록시 설정을 추가한다.

``` Nginx
server {
    ...
    location / {
        proxy_set_header    X-Real-IP  $remote_addr;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header    Host $http_host;
        proxy_pass http://192.168.0.100/;
        proxy_redirect off;
    }
}
```
프록시 주소는 반드시 내부 주소로 설정해야 한다.

## <a name="upstream"></a>Upstream 설정
앞서 설정한 부분까지만 진행한다면 사실 502 Bad Gate Way 오류가 날 것이다. 프록시만 패스하고 내부에서 통신하는 upstream 서버에 대한 허용은 하지 않았기 때문이다.
> upstream이란  
> proxy_pass 지시자를 통해 NGINX가 받은 리퀘스트를 넘겨 줄 서버들을 정의하는 지시자다.

각 upstream 서버는 https 연결을 허용하도록 구성되어야 한다. upstream은 다음과 같이 설정할 수 있다. 추가로 keepalive를 켜서 NGINX와 upstream 서버 간에 불필요한 통신을 최소화한다.

``` Nginx
upstream nas_server {
    server 192.168.0.100/;
    keepalive 100; # keepalive로 유지시키는 최대 커넥션 개수
}
```

그리고 앞서 설정했던 프록시 패스 서버를 upstream 서버로 바꾼다.

``` Nginx
server {
    ...
    location / {
        ...
        proxy_pass http://nas_server;
        ...
    }
}
```

## <a name="example"></a>완성된 NGINX 설정 예시
최종 완성된 NGINX 설정은 다음과 같다.

``` Nginx
upstream nas_server {
    server 192.168.0.100/;
    keepalive 100; # keepalive로 유지시키는 최대 커넥션 개수
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;

    server_name example.com;
    location / {
        proxy_set_header    X-Real-IP  $remote_addr;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header    Host $http_host;
        

        proxy_pass  http://nas_server;
        proxy_redirect off;
        
        # 추가 설정
        client_max_body_size 32M;
        client_body_buffer_size 512k;
        proxy_connect_timeout 90;
        proxy_send_timeout 90;
        proxy_read_timeout 1200;
        proxy_buffers 32 4k;
    }

    # certs sent to the client in SERVER HELLO are concatenated in ssl_certificate
    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # Diffie-Hellman parameter for DHE ciphersuites, recommended 2048 bits
    ssl_dhparam /etc/letsencrypt/live/eschocolat.me/dhparam.pem;

    # intermediate configuration. tweak to your needs.
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
    ssl_ciphers 'ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES128-SHA256:ECDHE-RSA-AES128-SHA256:ECDHE-ECDSA-AES128-SHA:ECDHE-RSA-AES256-SHA384:ECDHE-RSA-AES128-SHA:ECDHE-ECDSA-AES256-SHA384:ECDHE-ECDSA-AES256-SHA:ECDHE-RSA-AES256-SHA:DHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA:DHE-RSA-AES256-SHA256:DHE-RSA-AES256-SHA:ECDHE-ECDSA-DES-CBC3-SHA:ECDHE-RSA-DES-CBC3-SHA:EDH-RSA-DES-CBC3-SHA:AES128-GCM-SHA256:AES256-GCM-SHA384:AES128-SHA256:AES256-SHA256:AES128-SHA:AES256-SHA:DES-CBC3-SHA:!DSS';
    ssl_prefer_server_ciphers on;

    # HSTS (ngx_http_headers_module is required) (15768000 seconds = 6 months)
    add_header Strict-Transport-Security max-age=15768000;

    # OCSP Stapling ---
    # fetch OCSP records from URL in ssl_certificate and cache them
    ssl_stapling on;
    ssl_stapling_verify on;

    ## verify chain of trust of OCSP response using Root CA and Intermediate certs
    ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;

    resolver 8.8.8.8 8.8.4.4 valid=86400;
    resolver_timeout 10;
}
```

기타 설정은 NGINX의 SSL 설정을 만들어주는 <u>[Mozilla SSL Configuration Generator](https://mozilla.github.io/server-side-tls/ssl-config-generator/)</u>를 사용했다.  
서버를 실행하면 외부 접속했을 때 기분 좋은 녹색 자물쇠 표시를 볼 수 있다.  
![https](./https.png)

NAS https 설정을 하느라 꽤 오랫동안 삽질을 했다.  
나 같은 사람이 있다면 조금이나마 도움이 되었으면 하는 마음에 부족한 글을 올려 본다.