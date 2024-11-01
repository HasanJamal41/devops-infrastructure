# DevOps Infrastructure Documentation
Version 2.0
Last Updated: November 2024

## Table of Contents
1. Infrastructure Overview
2. CI/CD Pipeline
3. Docker Configuration
4. Nginx Configuration
5. SSL Management
6. Docker Swarm Configuration
7. Monitoring Setup
8. Deployment Process
9. Maintenance and Operations
10. Troubleshooting Guide

## 1. Infrastructure Overview

### 1.1 Components
- **Source Control**: GitHub
- **CI/CD**: Jenkins
- **Containerization**: Docker & Docker Swarm
- **Registry**: Docker Hub
- **Web Server**: Nginx
- **SSL Management**: Certbot & Ansible
- **Database**: MySQL 8.0
- **Frontend**: React application
- **Backend**: Python application
- **Monitoring**: Zabbix
- **Domain Management**: hasanjamal.online

### 1.2 Infrastructure Layout
- **EC2 Instance 1**: Jenkins Server (Swarm Worker Node + Zabbix Agent)
- **EC2 Instance 2**: Docker Swarm Manager (Zabbix Agent)
- **EC2 Instance 3**: Zabbix Server
- **Public IP**: 44.199.100.104 (mapped to hasanjamal.online)

### 1.3 Infrastructure Diagram
![alt text](image.png)

### 1.4 Repository Structure
```
devops-infrastructure/
├── ansible/
│   ├── group_vars/
│   │   └── swarm_manager.yml
│   ├── inventory.ini
│   └── ssl-renewal.yml
├── backend/
│   ├── Dockerfile
│   ├── app.py
│   └── requirements.txt
├── docker/
│   └── docker-compose.yml
├── frontend/
│   ├── Dockerfile
│   ├── .env
│   ├── package.json
│   └── src/
└── nginx/
    └── nginx.conf
```

## 2. CI/CD Pipeline

### 2.1 Jenkins Pipeline Stages
1. **Cleanup Workspace**: Ensures clean environment for build
2. **Clone Repository**: Fetches latest code from GitHub
3. **Parallel Tests**: Runs frontend and backend tests simultaneously
4. **Build Images**: Creates Docker images for frontend and backend
5. **Push Images**: Uploads images to Docker Hub
6. **Deploy to Swarm**: Updates the Docker Swarm services
7. **Update SSL**: Manages SSL certificates using Ansible
8. **Verify Deployment**: Confirms successful deployment

### 2.2 Jenins file 

pipeline {
    agent any

    environment {
        COMBINED_REPO = 'https://github.com/HasanJamal41/devops-infrastructure.git'
        FRONTEND_IMAGE = 'hasanjamal41/devops-end-to-end-frontend'
        BACKEND_IMAGE = 'hasanjamal41/devops-end-to-end-backend'
        TARGET_SERVER = '44.199.100.104'
        WORKSPACE_PATH = "${WORKSPACE}"
    }

    stages {
        stage('Cleanup Workspace') {
            steps {
                cleanWs()
            }
        }

        stage('Clone Repository') {
            steps {
                git credentialsId: 'github-creds2', url: COMBINED_REPO, branch: 'main'
                sh 'ls -R ${WORKSPACE}'
            }
        }

        stage('Basic Tests') {
            parallel {
                stage('Frontend Tests') {
                    steps {
                        dir("${WORKSPACE_PATH}/frontend") {
                            sh '''
                                if [ -f "package.json" ]; then
                                    npm install
                                    npm test || echo "No tests specified"
                                fi
                            '''
                        }
                    }
                }
                stage('Backend Tests') {
                    steps {
                        dir("${WORKSPACE_PATH}/backend") {
                            sh '''
                                if [ -f "package.json" ]; then
                                    npm install
                                    npm test || echo "No tests specified"
                                fi
                            '''
                        }
                    }
                }
            }
        }

        stage('Build Images') {
            steps {
                script {
                    dir("${WORKSPACE_PATH}/frontend") {
                        sh "docker build -t ${FRONTEND_IMAGE}:latest ."
                    }
                    dir("${WORKSPACE_PATH}/backend") {
                        sh "docker build -t ${BACKEND_IMAGE}:latest ."
                    }
                }
            }
        }

        stage('Push Images') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'dockerhub-creds', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
                    sh """
                        echo ${DOCKER_PASS} | docker login -u ${DOCKER_USER} --password-stdin
                        docker push ${FRONTEND_IMAGE}:latest
                        docker push ${BACKEND_IMAGE}:latest
                        docker logout
                    """
                }
            }
        }

        stage('Deploy to Swarm') {
            steps {
                script {
                    dir(WORKSPACE_PATH) {
                        sh "envsubst < docker/docker-compose.yml > docker-compose.deployed.yml"
                        sshagent(['ssh-creds']) {
                            sh """
                                ssh -o StrictHostKeyChecking=no ubuntu@${TARGET_SERVER} 'sudo mkdir -p /opt/devops-app'
                                scp -o StrictHostKeyChecking=no docker-compose.deployed.yml ubuntu@${TARGET_SERVER}:/opt/devops-app/docker-compose.yml
                                scp -o StrictHostKeyChecking=no nginx/nginx.conf ubuntu@${TARGET_SERVER}:/opt/devops-app/nginx.conf
                                scp -o StrictHostKeyChecking=no frontend/.env ubuntu@${TARGET_SERVER}:/opt/devops-app/frontend/.env
                                scp -o StrictHostKeyChecking=no backend/.env ubuntu@${TARGET_SERVER}:/opt/devops-app/backend/.env
                                ssh -o StrictHostKeyChecking=no ubuntu@${TARGET_SERVER} 'cd /opt/devops-app && docker stack deploy -c docker-compose.yml --with-registry-auth devops-end-to-end'
                            """
                        }
                    }
                }
            }
        }

        stage('Update SSL Certificates') {
            steps {
                script {
                    dir("${WORKSPACE_PATH}/ansible") {
                        sh '''
                            if ! command -v ansible &> /dev/null; then
                                sudo apt update
                                sudo apt install -y ansible
                            fi
                        '''
                        sshagent(['ssh-creds']) {
                            sh 'ansible-playbook -i inventory.ini ssl-renewal.yml -v'
                        }
                    }
                }
            }
        }

        stage('Verify Deployment') {
            steps {
                sshagent(['ssh-creds']) {
                    sh "ssh -o StrictHostKeyChecking=no ubuntu@${TARGET_SERVER} 'docker stack services devops-end-to-end'"
                }
            }
        }
    }

    post {
        always {
            cleanWs()
            sh 'docker system prune -f'
        }
        success {
            emailext(
                subject: "✅ Pipeline Successful: Build #${BUILD_NUMBER}",
                body: "Build: #${BUILD_NUMBER}\nStatus: SUCCESS\nFrontend Image: ${FRONTEND_IMAGE}:latest\nBackend Image: ${BACKEND_IMAGE}:latest\nDeployed to: ${TARGET_SERVER}\nSSL Certificate Status: Updated",
                to: 'hatafhasan95@gmail.com'
            )
        }
        failure {
            emailext(
                subject: "❌ Pipeline Failed: Build #${BUILD_NUMBER}",
                body: "Build: #${BUILD_NUMBER}\nStatus: FAILED\nCheck Jenkins logs: ${BUILD_URL}",
                to: 'hatafhasan95@gmail.com'
            )
        }
    }
}




## 3. Docker Configuration

### 3.1 Service Architecture
- Frontend Service (React): 
  - Port: 3000
  - Environment Variables:
    ```
    REACT_APP_BACKEND_URL=http://backend:5000
    ```
- Backend Service (Python): Port 5000
- MySQL Database: Port 3306
- Nginx Reverse Proxy: Ports 80, 443

### 3.2 Network Configuration
- Network Type: Overlay
- Network Name: app-network
- Internal Service Discovery enabled

### 3.3 Volume Configuration
- Database persistence: db-data volume
- SSL certificates: mounted from host
- Nginx configuration: mounted from host

## 4. Nginx Configuration

/opt/devops-app
ubuntu@ip-172-31-81-26:/opt/devops-app$ cat nginx.conf
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    upstream frontend_servers {
        server devops-end-to-end_frontend:3000;
    }
    upstream backend_servers {
        server devops-end-to-end_backend:5000;
    }

    # Redirect HTTP to HTTPS
    server {
        listen 80;
        server_name hasanjamal.online;
        return 301 https://$server_name$request_uri;
    }

    # HTTPS Server
    server {
        listen 443 ssl;
        server_name hasanjamal.online;

        # SSL Configuration
        ssl_certificate /etc/letsencrypt/live/hasanjamal.online/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/hasanjamal.online/privkey.pem;
        ssl_session_timeout 1d;
        ssl_session_cache shared:SSL:50m;
        ssl_session_tickets off;

        # Modern configuration
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;

        # HSTS (uncomment if you're sure)
        # add_header Strict-Transport-Security "max-age=63072000" always;

        location / {
            proxy_pass http://frontend_servers;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /api/ {
            proxy_pass http://backend_servers;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}


## 5. SSL Management

### 5.1 Domain Configuration
- Domain Name: hasanjamal.online
- DNS Record Type: A
- Points to: 44.199.100.104
- Provider: Let's Encrypt
- Auto-renewal: Enabled
- Certificate Path: /etc/letsencrypt/live/hasanjamal.online/

### 5.2 Ansible Automation
- Automatic certificate renewal
- Nginx service updates
- Daily checks via cron
- Post-renewal hooks

>> For SSL
jenkins@ip-172-31-10-216:~/.ssh$ cat setup_ssl.yml

```
  become: yes
  tasks:
    - name: Install Certbot
      apt:
        name: certbot
        state: present

    - name: Install Certbot NGINX plugin
      apt:
        name: python3-certbot-nginx
        state: present

    - name: Obtain SSL certificate
      command: >
        certbot certonly --nginx -d hasanjamal.online --non-interactive --agree-tos
        --email hasanjamal4141@gmail.com
      args:
        chdir: /opt/devops-app

    - name: Copy NGINX configuration file
      copy:
        src: /opt/devops-app/nginx.conf  # This assumes nginx.conf is already on the remote server
        dest: /etc/nginx/nginx.conf        # Update the destination path if needed
        remote_src: true                   # This indicates the source file is already on the remote machine

    - name: Update NGINX service in Docker Swarm
      command: >
        docker service update --force devops-end-to-end_nginx
      args:
        chdir: /opt/devops-app

    - name: Restart NGINX to apply changes
      command: >
        docker exec devops-end-to-end_nginx nginx -s reload- hosts: docker_nodes

```

> Inventory
jenkins@ip-172-31-10-216:~/ansible$ cat inventory.ini

```
[swarm_manager]
ip-172-31-81-26 ansible_ssh_user=ubuntu ansible_ssh_private_key_file=/var/lib/jenkins/.ssh/id_rsa

```
> Renewl
jenkins@ip-172-31-10-216:~/ansible$ cat ssl-renewal.yml

```

- name: SSL Certificate Renewal and Nginx Configuration
  hosts: swarm_manager
  become: yes
  vars:
    domain: hasanjamal.online
    email: hatafhasan95@gmail.com
    nginx_service: devops-end-to-end_nginx
    app_path: /opt/devops-app

  tasks:
    - name: Ensure Certbot is installed
      apt:
        name:
          - certbot
          - python3-certbot-nginx
        state: present
        update_cache: yes

    - name: Check if certificate exists
      stat:
        path: "/etc/letsencrypt/live/{{ domain }}/fullchain.pem"
      register: cert_file

    - name: Obtain or renew SSL certificate
      command: >
        certbot certonly --nginx
        -d {{ domain }}
        --email {{ email }}
        --agree-tos
        --non-interactive
        --post-hook "docker service update --force {{ nginx_service }}"
      when: not cert_file.stat.exists

    - name: Set up automatic renewal
      cron:
        name: "SSL renewal cron job"
        job: "certbot renew --quiet --post-hook 'docker service update --force {{ nginx_service }}'"
        special_time: daily

    - name: Create renewal-hook script
      copy:
        dest: /etc/letsencrypt/renewal-hooks/post/update-nginx.sh
        mode: '0755'
        content: |
          #!/bin/bash
          docker service update --force {{ nginx_service }}

    - name: Verify Nginx configuration
      command: nginx -t
      changed_when: false

```

## 6. Docker Swarm Configuration

### 6.1 Cluster Setup Commands
```bash

docker swarm init --advertise-addr <MANAGER-IP>
docker swarm join-token worker
docker swarm join --token <TOKEN> <MANAGER-IP>:2377
docker node ls
docker service create --name my_service --replicas 3 nginx
docker service scale my_service=5
docker service ls
docker stack deploy -c docker-compose.yml my_stack
docker stack ls
docker node promote <NODE_ID>
docker swarm leave --force
docker service ps <service_name> to check replicas
sudo systemctl restart docker
docker network create --driver overlay app-network

```

### 6.2 Current Services
```bash
docker service ls
ID            NAME                          MODE        REPLICAS    IMAGE                                          PORTS
as4fk71mlo1w  devops-end-to-end_backend    replicated  3/3        hasanjamal41/devops-end-to-end-backend:latest
ipcb1mz8vzlp  devops-end-to-end_db         replicated  3/3        mysql:8.0
y9b38jburo61  devops-end-to-end_frontend   replicated  3/3        hasanjamal41/devops-end-to-end-frontend:latest
7pp4j69zlo5r  devops-end-to-end_nginx      replicated  3/3        nginx:alpine                                   *:80->80/tcp, *:443->443/tcp
```

### 6.3 Stack Configuration (docker-compose.yml)
```yaml
version: '3.8'

services:
  frontend:
    image: hasanjamal41/devops-end-to-end-frontend:latest
    environment:
      - REACT_APP_BACKEND_URL=http://backend:5000
    networks:
      - app-network

  backend:
    image: hasanjamal41/devops-end-to-end-backend:latest
    networks:
      - app-network

  db:
    image: mysql:8.0
    environment:
      - MYSQL_ROOT_PASSWORD=your_password
      - MYSQL_DATABASE=your_db
    volumes:
      - db-data:/var/lib/mysql
    networks:
      - app-network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    networks:
      - app-network

networks:
  app-network:
    driver: overlay

volumes:
  db-data:
```

## 7. Monitoring Setup

### 7.1 Zabbix Server Configuration
- **Location**: EC2 Instance 3
- **Configuration File**: /etc/zabbix/zabbix_server.conf
- **Key Settings**:
  ```
  EnableGlobalScripts=1
  DBUser=zabbix
  DBPassword=password
  DBName=zabbix
  ```

### 7.2 Zabbix Agent Configuration
- **Agent Locations**: Jenkins Server and Docker Swarm
- **Configuration File**: /usr/local/etc/zabbix_agentd.conf
- **Key Settings**:
  ```
  LogFile=/var/log/zabbix/zabbix_agentd.log
  Server=172.31.19.225
  Hostname=Docker-server
  EnableRemoteCommands=1
  ServerActive=172.31.19.225
  ```
>  Installatio of Zabbix Server
```
wget https://repo.zabbix.com/zabbix/6.0/ubuntu/pool/main/z/zabbix-release/zabbix-release_6.0-1+ubuntu$(lsb_release -rs)_all.deb
sudo dpkg -i zabbix-release_6.0-1+ubuntu$(lsb_release -rs)_all.deb
sudo apt update
sudo apt install zabbix-server-mysql zabbix-frontend-php zabbix-apache-conf zabbix-sql-scripts zabbix-agent
sudo apt install mysql-server
sudo mysql -uroot -p
CREATE DATABASE zabbix CHARACTER SET utf8 COLLATE utf8_bin;
CREATE USER 'zabbix'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON zabbix.* TO 'zabbix'@'localhost';
FLUSH PRIVILEGES;
EXIT;
zcat /usr/share/zabbix-sql-scripts/mysql/server.sql.gz | mysql -uzabbix -p zabbix
sudo nano /etc/zabbix/zabbix_server.conf
sudo systemctl restart zabbix-server zabbix-agent apache2
sudo systemctl enable zabbix-server zabbix-agent apache2
sudo nano /etc/zabbix/apache.conf
http://your_server_ip/zabbix

```
>Zabbix Agent on Other Hosts
```
wget https://repo.zabbix.com/zabbix/6.0/ubuntu/pool/main/z/zabbix-release/zabbix-release_6.0-1+ubuntu$(lsb_release -rs)_all.deb
sudo dpkg -i zabbix-release_6.0-1+ubuntu$(lsb_release -rs)_all.deb
sudo apt update
sudo apt install zabbix-agent
sudo nano /etc/zabbix/zabbix_agentd.conf
Server=your_zabbix_server_ip
ServerActive=your_zabbix_server_ip
Hostname=your_client_hostname
sudo systemctl restart zabbix-agent
sudo systemctl enable zabbix-agent

```

> Add Hosts in Zabbix Frontend

1. Go to Configuration > Hosts in the Zabbix frontend.
2. Click Create host and configure:
3. Hostname: Match the hostname defined in zabbix_agentd.conf.
4. Groups: Select a relevant group, e.g., "Linux servers."
5. Interfaces: Add the IP address of the agent host.
6. Templates: Link a template, such as "Template OS Linux" to monitor standard metrics.

## 9. Maintenance and Operations

### 9.1 Service Management
```bash
# Scale services
docker service scale devops-end-to-end_frontend=3

# Update services
docker service update --image hasanjamal41/devops-end-to-end-frontend:latest devops-end-to-end_frontend

# Service inspection
docker service inspect devops-end-to-end_frontend
```

### 9.2 Health Checks
```bash
# Check service status
docker stack ps devops-end-to-end

# View service logs
docker service logs devops-end-to-end_frontend
docker service logs devops-end-to-end_backend

# Check SSL certificate
certbot certificates
```

### 9.3 Backup Procedures
```bash
# Service configuration backup
docker service inspect devops-end-to-end_frontend > frontend-config-backup.json

# Stack backup
docker stack ls > stack-backup.txt
docker service ls > service-backup.txt

# Database backup
docker exec $(docker ps -q -f name=devops-end-to-end_db) mysqldump -u root -p your_db > backup.sql

# Configuration backup
tar -czf config-backup.tar.gz /opt/devops-app
```

## 10. Troubleshooting Guide

### 10.1 Common Issues

#### SSL Certificate Issues
```bash
certbot certificates  # Check certificate status
certbot renew --force-renewal  # Force renewal
```

#### Docker Service Issues
```bash
docker service ls  # Check service status
docker service logs <service_name>  # Check service logs
```

#### Nginx Issues
```bash
nginx -t  # Test configuration
docker exec nginx nginx -s reload  # Reload configuration
```

#### Zabbix Agent Issues
```bash
systemctl status zabbix-agent  # Check agent status
tail -f /var/log/zabbix/zabbix_agentd.log  # Check agent logs
zabbix_get -s localhost -k agent.ping  # Test agent connectivity
```

#### DNS Issues
```bash
dig hasanjamal.online  # Check DNS resolution
nslookup hasanjamal.online  # Verify A record
ping hasanjamal.online  # Test connectivity
```

### 10.2 Performance Monitoring
```bash
# Docker stats
docker stats

# Service metrics
docker service ps devops-end-to-end_frontend --format "{{.Node}} {{.CurrentState}}"

# Node resources
docker node ls --format "{{.Hostname}}: {{.Status.State}}"
```

### 11: Miscelenious 

git init
git clone <repository_url>
git add <file_or_directory>
git add .
git commit -m "Your commit message"
git branch
git push origin <branch_name>
git log
