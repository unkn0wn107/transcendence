# **************************************************************************** #
#                                                                              #
#                                                         :::      ::::::::    #
#    Makefile                                           :+:      :+:    :+:    #
#                                                     +:+ +:+         +:+      #
#    By: agaley <agaley@student.42lyon.fr>          +#+  +:+       +#+         #
#                                                 +#+#+#+#+#+   +#+            #
#    Created: 2023/12/15 15:51:13 by agaley            #+#    #+#              #
#    Updated: 2024/06/27 15:34:58 by agaley           ###   ########lyon.fr    #
#                                                                              #
# **************************************************************************** #

NAME = transcendence

SHELL := /bin/bash
ENV_FILE = transcendence/.env

export MY_GID ?= $(id -g)
export BUILD_TYPE ?= prod
export MY_UID ?= $(id -u)
export NGINX_PORT_1 ?= 8000
export NGINX_PORT_2 ?= 8001
export CONTAINER ?= transcendence-$(BUILD_TYPE)
export PORT ?= 8080

SRC_ENV = set -a; source $(ENV_FILE); set +a;

all: build dev

$(NAME):

run: daemon
	$(MAKE) wait-for-healthy
	@make logs

daemon:
	$(SRC_ENV) DEBUG=False BUILD_TYPE=prod docker compose up -d

dev:
	$(SRC_ENV) DEBUG=True BUILD_TYPE=debug docker compose up --watch

build-dev:
	$(SRC_ENV) docker build -t $(CONTAINER) -f Dockerfile .

build:
	$(SRC_ENV) docker build -t $(CONTAINER) -f Dockerfile .

rebuild:
	$(SRC_ENV) BUILD_TYPE=debug docker compose build

logs:
	$(SRC_ENV) docker compose logs -f

stop:
	$(SRC_ENV) docker compose stop

test: stop build
	$(SRC_ENV) docker compose up auth-test

test-compare: stop daemon
	@$(MAKE) nginxd
	$(MAKE) wait-for-healthy
	$(MAKE) wait-for-nginx-healthy
	$(SRC_ENV) ./test_compare.sh
	@make clean

siege: stop daemon
	$(MAKE) wait-for-healthy
	echo "init" > siege.log
	docker compose up siege
	# make logs
	@make clean
	cat siege.log

siege-nginx: stop nginxd
	$(MAKE) wait-for-nginx-healthy
	CONTAINER=nginx docker compose up siege
	@make clean
	cat siege.log

run_tests:
	$(SRC_ENV) ./test.sh
	$(SRC_ENV) ./test_compare.sh

wait-for-healthy:
	@echo "Waiting for transcendence docker to be healthy..."
	@while ! docker inspect --format='{{json .State.Health.Status}}' django | grep -q '"healthy"'; do \
		echo "Waiting for django to become healthy..."; \
		sleep 2; \
	done

wait-for-nginx-healthy:
	@echo "Waiting for nginx docker to be healthy..."
	@while ! docker inspect --format='{{json .State.Health.Status}}' nginx | grep -q '"healthy"'; do \
		echo "Waiting for nginx to become healthy..."; \
		sleep 2; \
	done

update_gitignore:
	@if ! grep -q "$(LOG_FILE_EXT)" .gitignore; then \
		echo "$(LOG_FILE_EXT)" >> .gitignore; \
		echo "Added $(LOG_FILE_EXT) to .gitignore"; \
	else \
		echo "$(LOG_FILE_EXT) already in .gitignore"; \
	fi

nginx:
	NGINX_PORT_1=$(NGINX_PORT_1) NGINX_PORT_2=$(NGINX_PORT_2) docker compose up nginx --build

nginxd:
	NGINX_PORT_1=$(NGINX_PORT_1) NGINX_PORT_2=$(NGINX_PORT_2) docker compose up -d nginx --build

docker-clean:
	docker compose down --rmi all

docker-fclean:
	docker system prune --all --volumes -f

clean: docker-stop docker-clean

fclean: clean docker-fclean

re: fclean all
debug_re: fclean debug

.PHONY: all clean fclean re debug debug_re
.PHONY: env run daemon dev build logs stop
.PHONY: test test-compare wait-for-healthy wait-for-nginx-healthy
.PHONY: nginx nginxd docker-stop docker-fclean run_tests
