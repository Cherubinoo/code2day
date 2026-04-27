#!/bin/bash

# Judge0 Installation and Configuration Script
# This script sets up Judge0 with all programming language modules and public IP access

set -e  # Exit on any error

echo "🚀 Judge0 Installation and Configuration Script"
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
JUDGE0_VERSION="1.13.0"
PUBLIC_IP=""
DOMAIN=""

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}$1${NC}"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_error "This script should not be run as root for security reasons."
        print_status "Please run as a regular user with sudo privileges."
        exit 1
    fi
}

# Check system requirements
check_requirements() {
    print_header "Checking System Requirements..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        print_status "Visit: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        print_status "Visit: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    # Check if user is in docker group
    if ! groups $USER | grep -q docker; then
        print_warning "User $USER is not in the docker group."
        print_status "Adding user to docker group..."
        sudo usermod -aG docker $USER
        print_warning "Please log out and log back in for group changes to take effect."
        print_status "Then run this script again."
        exit 1
    fi
    
    print_status "All requirements satisfied!"
}

# Get public IP configuration
get_ip_config() {
    print_header "Network Configuration..."
    
    # Try to detect public IP
    PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "")
    
    if [[ -n "$PUBLIC_IP" ]]; then
        print_status "Detected public IP: $PUBLIC_IP"
        read -p "Use this IP for Judge0? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            PUBLIC_IP=""
        fi
    fi
    
    if [[ -z "$PUBLIC_IP" ]]; then
        read -p "Enter your public IP address (or press Enter for localhost): " PUBLIC_IP
        if [[ -z "$PUBLIC_IP" ]]; then
            PUBLIC_IP="localhost"
        fi
    fi
    
    read -p "Enter domain name (optional, press Enter to skip): " DOMAIN
    
    print_status "Configuration:"
    print_status "  IP: $PUBLIC_IP"
    if [[ -n "$DOMAIN" ]]; then
        print_status "  Domain: $DOMAIN"
    fi
}

# Create Judge0 configuration
create_config() {
    print_header "Creating Judge0 Configuration..."
    
    # Create judge0 directory
    mkdir -p judge0
    cd judge0
    
    # Create docker-compose.yml with all language support
    cat > docker-compose.yml << EOF
version: '3.7'

x-logging:
  &default-logging
  logging:
    driver: json-file
    options:
      max-size: 100M

services:
  server:
    image: judge0/judge0:$JUDGE0_VERSION
    volumes:
      - ./judge0.conf:/judge0.conf:ro
    ports:
      - "2358:2358"
    privileged: true
    <<: *default-logging
    restart: always
    depends_on:
      - db
      - redis

  workers:
    image: judge0/judge0:$JUDGE0_VERSION
    command: ["./scripts/workers"]
    volumes:
      - ./judge0.conf:/judge0.conf:ro
    privileged: true
    <<: *default-logging
    restart: always
    depends_on:
      - db
      - redis

  db:
    image: postgres:13
    env_file: judge0.conf
    volumes:
      - postgres-data:/var/lib/postgresql/data/
    <<: *default-logging
    restart: always

  redis:
    image: redis:6
    command: [
      "bash", "-c",
      'docker-entrypoint.sh --appendonly yes --requirepass "\$\$REDIS_PASSWORD"'
    ]
    env_file: judge0.conf
    volumes:
      - redis-data:/data
    <<: *default-logging
    restart: always

volumes:
  postgres-data:
  redis-data:
EOF

    # Create judge0.conf with comprehensive language support
    cat > judge0.conf << EOF
################################################################################
# Judge0 Configuration File
################################################################################

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=YourRedisPassword

# PostgreSQL Configuration
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_DB=judge0
POSTGRES_USER=judge0
POSTGRES_PASSWORD=YourPostgresPassword

# Judge0 API Configuration
JUDGE0_VERSION=$JUDGE0_VERSION
JUDGE0_HOMEPAGE=http://$PUBLIC_IP:2358

# Enable all programming languages
ENABLE_WAIT_RESULT=true
ENABLE_COMPILER_OPTIONS=true
ENABLE_COMMAND_LINE_ARGUMENTS=true
ENABLE_SUBMISSION_DELETE=true
ENABLE_CALLBACKS=true

# Security
ALLOW_ENABLE_NETWORK=true
ALLOW_ENABLE_PER_PROCESS_AND_THREAD_TIME_LIMIT=true
ALLOW_ENABLE_PER_PROCESS_AND_THREAD_MEMORY_LIMIT=true

# Language-specific configurations
ENABLE_ADDITIONAL_FILES=true

# Network access (required for some languages)
ENABLE_NETWORK=true

# File system
MAX_EXTRACT_SIZE=256MB
MAX_FILE_SIZE=1MB
MAX_NUMBER_OF_FILES=30

# Execution limits
MAX_CPU_TIME_LIMIT=15
MAX_CPU_EXTRA_TIME_LIMIT=5
MAX_WALL_TIME_LIMIT=20
MAX_MEMORY_LIMIT=512000
MAX_STACK_LIMIT=128000
MAX_PROCESSES_AND_OR_THREADS=120
MAX_NUMBER_OF_RUNS=20

# Queue configuration
MAX_QUEUE_SIZE=100

# Maintenance
MAINTENANCE_MODE=false
MAINTENANCE_MESSAGE="Judge0 is under maintenance."

# Callbacks
CALLBACKS_MAX_TRIES=3
CALLBACKS_TIMEOUT=5

# Language support - Enable all available languages
LANGUAGE_CONFIGS_PATH=/usr/local/etc/judge0/languages

# Additional language modules
ENABLE_BATCHED_SUBMISSIONS=true
ENABLE_SUBMISSION_DELETE=true

# CORS Configuration
ALLOW_ORIGIN=*
ALLOW_METHODS=GET,POST,PUT,DELETE,OPTIONS
ALLOW_HEADERS=*

# Public access configuration
EOF

    if [[ "$PUBLIC_IP" != "localhost" ]]; then
        echo "JUDGE0_HOST=0.0.0.0" >> judge0.conf
        echo "JUDGE0_BIND_ADDRESS=0.0.0.0" >> judge0.conf
    fi

    print_status "Configuration files created successfully!"
}

# Install Judge0
install_judge0() {
    print_header "Installing Judge0..."
    
    print_status "Pulling Docker images..."
    docker-compose pull
    
    print_status "Starting Judge0 services..."
    docker-compose up -d
    
    print_status "Waiting for services to start..."
    sleep 30
    
    # Check if services are running
    if docker-compose ps | grep -q "Up"; then
        print_status "Judge0 services are running!"
    else
        print_error "Some services failed to start. Check logs with: docker-compose logs"
        exit 1
    fi
}

# Test installation
test_installation() {
    print_header "Testing Judge0 Installation..."
    
    # Wait a bit more for full initialization
    print_status "Waiting for Judge0 to fully initialize..."
    sleep 20
    
    # Test system info endpoint
    local base_url="http://$PUBLIC_IP:2358"
    if [[ "$PUBLIC_IP" == "localhost" ]]; then
        base_url="http://localhost:2358"
    fi
    
    print_status "Testing system info endpoint..."
    if curl -s "$base_url/system_info" > /dev/null; then
        print_status "✅ System info endpoint is responding!"
    else
        print_warning "System info endpoint not responding yet. This might be normal during startup."
    fi
    
    # Test languages endpoint
    print_status "Testing languages endpoint..."
    if curl -s "$base_url/languages" > /dev/null; then
        print_status "✅ Languages endpoint is responding!"
        
        # Count available languages
        local lang_count=$(curl -s "$base_url/languages" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "unknown")
        print_status "Available languages: $lang_count"
    else
        print_warning "Languages endpoint not responding yet."
    fi
}

# Configure firewall
configure_firewall() {
    if [[ "$PUBLIC_IP" != "localhost" ]]; then
        print_header "Configuring Firewall..."
        
        # Check if ufw is available
        if command -v ufw &> /dev/null; then
            print_status "Opening port 2358 in UFW firewall..."
            sudo ufw allow 2358/tcp
            print_status "Firewall configured!"
        else
            print_warning "UFW not found. Please manually open port 2358 in your firewall."
        fi
    fi
}

# Create systemd service for auto-start
create_systemd_service() {
    print_header "Creating Systemd Service..."
    
    local service_file="/etc/systemd/system/judge0.service"
    local current_dir=$(pwd)
    
    sudo tee $service_file > /dev/null << EOF
[Unit]
Description=Judge0 Code Execution System
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$current_dir
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable judge0.service
    
    print_status "Systemd service created and enabled!"
    print_status "Judge0 will now start automatically on boot."
}

# Print final information
print_final_info() {
    print_header "Installation Complete!"
    echo
    print_status "Judge0 is now running and accessible at:"
    
    if [[ "$PUBLIC_IP" != "localhost" ]]; then
        print_status "  🌐 Public: http://$PUBLIC_IP:2358"
        if [[ -n "$DOMAIN" ]]; then
            print_status "  🌐 Domain: http://$DOMAIN:2358"
        fi
    fi
    print_status "  🏠 Local: http://localhost:2358"
    
    echo
    print_status "Useful endpoints:"
    print_status "  📊 System Info: /system_info"
    print_status "  🌐 Languages: /languages"
    print_status "  📝 Submit Code: /submissions"
    print_status "  📚 Documentation: https://ce.judge0.com"
    
    echo
    print_status "Management commands:"
    print_status "  🔄 Restart: docker-compose restart"
    print_status "  📋 Logs: docker-compose logs -f"
    print_status "  ⏹️  Stop: docker-compose down"
    print_status "  🗑️  Remove: docker-compose down -v"
    
    echo
    print_status "Test your installation:"
    print_status "  python3 judge0_test.py"
    
    if [[ "$PUBLIC_IP" != "localhost" ]]; then
        echo
        print_warning "Security Notes:"
        print_warning "  • Judge0 is now accessible from the internet"
        print_warning "  • Consider setting up authentication/rate limiting"
        print_warning "  • Monitor resource usage and logs regularly"
        print_warning "  • Keep Judge0 updated for security patches"
    fi
}

# Main installation flow
main() {
    check_root
    check_requirements
    get_ip_config
    create_config
    install_judge0
    test_installation
    configure_firewall
    create_systemd_service
    print_final_info
}

# Run main function
main "$@"