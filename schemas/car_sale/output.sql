create database car_sale;
use car_sale;

create table if not exists Dim_Budget (
consumption	 varchar(50),
No_of_gears	 varchar(50),
Budget_SK	 varchar(50) PRIMARY KEY
);
alter table Dim_Budget add Model	 varchar(50);
alter table Dim_Budget add Car_SK	 varchar(50) ;

create table if not exists Dim_Luxury (
Music_System	 varchar(50),
length	 varchar(50),
Luxury_SK	 varchar(50) PRIMARY KEY
);
alter table Dim_Luxury add Model	 varchar(50);
alter table Dim_Luxury add Car_SK	 varchar(50) ;

create table if not exists Dim_customer (
name	 varchar(50),
customer_SK	 varchar(50) PRIMARY KEY
);
alter table Dim_customer add type	 varchar(50);
alter table Dim_customer add Corporate_SK	 varchar(50) ;
alter table Dim_customer add address	 varchar(50);
alter table Dim_customer add Individual_SK	 varchar(50) ;
alter table Dim_customer add Profession	 varchar(50);
alter table Dim_customer add Agency	 varchar(50);
alter table Dim_customer add Professional_SK	 varchar(50) ;

create table if not exists Dim_state (
state_name	 varchar(50),
state_SK	 varchar(50) PRIMARY KEY
);
alter table Dim_state add cityName	 varchar(50);
alter table Dim_state add city_SK	 varchar(50) ;


create table sale (
ex_showroom_price	Numeric,
sale_Key	varchar(50) PRIMARY KEY
);

alter table sale add Budget_SK	varchar(50) ;
alter table sale add foreign key (Budget_SK) references Dim_Budget(Budget_SK);
alter table sale add Luxury_SK	varchar(50) ;
alter table sale add foreign key (Luxury_SK) references Dim_Luxury(Luxury_SK);
alter table sale add state_SK	varchar(50) ;
alter table sale add foreign key (state_SK) references Dim_state(state_SK);
alter table sale add customer_SK	varchar(50) ;
alter table sale add foreign key (customer_SK) references Dim_customer(customer_SK);


create table analysis_property (
Adat varchar(50), 
Attribute varchar(50), 
Pan varchar(50), 
is_Additive boolean, 
cardinality varchar(20), 
Applicability boolean, 
PRIMARY KEY (Adat, Attribute, Pan)
); 
insert into analysis_property (Adat, Attribute, Pan, is_Additive,cardinality,Applicability) values ('sale', 'ex_showroom_price', 'Budget', true, 'many one', true);
insert into analysis_property (Adat, Attribute, Pan, is_Additive,cardinality,Applicability) values ('sale', 'ex_showroom_price', 'Luxury', true, 'many one', true);
insert into analysis_property (Adat, Attribute, Pan, is_Additive,cardinality,Applicability) values ('sale', 'ex_showroom_price', 'state', true, 'many one', true);

create table Bridge_sale_customer (
sale_key varchar(50), 
customer_SK varchar(50), 
PRIMARY KEY (sale_key, customer_SK)
);
insert into analysis_property (Adat, Attribute, Pan, is_Additive,cardinality,Applicability) values ('sale', 'ex_showroom_price', 'customer', true, 'many many', true);


create table dependentAdat (
Adat_dependee varchar(50), 
Adat_dependent varchar(50), 
PRIMARY KEY (Adat_dependee, Adat_dependent)
);  
alter table sale add Base_amount	Numeric;
alter table sale add Tax_amount	Numeric;
alter table sale add Premium	Numeric;