create database sale;
use sale;

create table if not exists Dim_Product (
color	 varchar(50),
name	 varchar(50),
Product_SK	 varchar(50) PRIMARY KEY
);
alter table Dim_Product add attr_1	 varchar(50);
alter table Dim_Product add non_perishable_SK	 varchar(50) ;
alter table Dim_Product add attr_1	 varchar(50);
alter table Dim_Product add Perishable_SK	 varchar(50) ;
create table sale (
value	Numeric,
sale_Key	varchar(50) PRIMARY KEY
);
alter table sale add Product_SK	varchar(50) ;
alter table sale add foreign key (Product_SK) references Dim_Product(Product_SK);

create table analysis_property (
Adat varchar(50), 
Attribute varchar(50), 
Pan varchar(50), 
is_Additive boolean, 
cardinality varchar(20), 
Applicability boolean, 
PRIMARY KEY (Adat, Attribute, Pan)
); 

create table Bridge_sale_Product (
sale_key varchar(50), 
Product_SK varchar(50), 
PRIMARY KEY (sale_key, Product_SK)
);
insert into analysis_property (Adat, Attribute, Pan, is_Additive,cardinality,Applicability) values ('sale', 'value', 'Product', true, '* *', true);

create table dependentAdat (
Adat_dependee varchar(50), 
Adat_dependent varchar(50), 
PRIMARY KEY (Adat_dependee, Adat_dependent)
);